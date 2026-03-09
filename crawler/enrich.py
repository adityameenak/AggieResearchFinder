#!/usr/bin/env python3
"""
Enrich faculty.json with AI-generated research reviews using Gemini.
Uses the new google-genai SDK. Rate-limited, saves progress on quota errors.
Re-runnable: only processes records missing ai_review.
"""
from __future__ import annotations
import json, os, sys, time
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

FACULTY_JSON = Path("faculty.json")
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    print("Error: GEMINI_API_KEY not set in environment or .env")
    sys.exit(1)

from google import genai
client = genai.Client(api_key=API_KEY)
MODEL = "gemini-2.5-flash-lite"

SAVE_EVERY = 25

data = json.load(FACULTY_JSON.open(encoding="utf-8"))
need_review = [r for r in data if not r.get("ai_review") and len((r.get("research_summary") or "").replace("|", ",").strip()) >= 40]
print(f"Total records: {len(data)}")
print(f"Need AI review: {len(need_review)}")

generated = 0
errors = 0
delay = 4  # start at 4s between calls

for i, rec in enumerate(need_review):
    cleaned = rec["research_summary"].replace("|", ",").strip()[:1000]
    prompt = (
        f"You are an academic writing assistant. Based on the following scraped research "
        f"information about a professor, write a comprehensive yet concise review (4-6 sentences) "
        f"of their research work that a student could read to quickly understand what this "
        f"professor does and what their lab focuses on. Write in third person. Be specific "
        f"about research topics and methods. Do not fabricate details beyond what is provided.\n\n"
        f"Professor: {rec['name']}\n"
        f"Department: {rec.get('department', '')}\n"
        f"Research information: {cleaned}\n\n"
        f"Write the review as a single paragraph with no heading or bullet points."
    )

    # Retry with exponential backoff on rate limit
    for attempt in range(6):
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
            rec["ai_review"] = response.text.strip()
            generated += 1
            # Success — reduce delay back toward 4s
            delay = max(4, delay - 0.5)
            print(f"  [{i+1}/{len(need_review)}] {rec['name']}")
            break
        except Exception as exc:
            exc_str = str(exc).lower()
            if "quota" in exc_str or "resource_exhausted" in exc_str or "429" in exc_str or "503" in exc_str or "unavailable" in exc_str:
                wait = min(15 * (2 ** attempt), 120)
                print(f"  [{i+1}/{len(need_review)}] {rec['name']} — rate limited, waiting {wait}s (attempt {attempt+1}/6)")
                time.sleep(wait)
                # Increase steady-state delay to avoid future hits
                delay = min(delay + 1, 10)
            else:
                print(f"  [{i+1}/{len(need_review)}] {rec['name']} ERROR: {type(exc).__name__}: {str(exc)[:200]}")
                errors += 1
                break

    # Save progress periodically
    if generated > 0 and generated % SAVE_EVERY == 0:
        FACULTY_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  [checkpoint] Saved progress ({generated} reviews so far)")

    time.sleep(delay)

# Final save
FACULTY_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"\nDone: {generated} reviews generated, {errors} errors. Saved to {FACULTY_JSON}")
