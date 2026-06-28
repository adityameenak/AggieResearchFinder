#!/usr/bin/env python3
"""
Enrich a faculty JSON file with AI-generated research reviews using a local
Ollama model. Re-runnable: replaces formulaic template reviews and fills
missing ones.

Usage:
  python enrich_ollama.py                      # default: faculty.json (TAMU)
  python enrich_ollama.py --file faculty-rice.json
  python enrich_ollama.py --file faculty-rice.json --model gemma3:4b
"""
import argparse, json, sys, time
from pathlib import Path
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "gemma3:4b"
SAVE_EVERY = 25


def needs_review(rec):
    """Check if a record needs an AI review (re-)generated."""
    review = rec.get("ai_review", "")
    summary = (rec.get("research_summary") or "").strip()

    # Must have enough source material
    if len(summary) < 40:
        return False

    # No review at all
    if not review:
        return True

    # Formulaic template review from enrich_local.py
    if "faculty member in" in review[:80]:
        return True

    # Bad Gemini placeholder
    if review.startswith("Please provide"):
        return True

    # Navigation junk leaked into review
    if "Close the" in review or "Faculty & Research menu" in review or "Instructional Faculty" in review:
        return True

    return False


def generate_review(rec, model=MODEL):
    """Call Ollama to generate a research review."""
    cleaned = rec.get("research_summary", "").replace("|", ", ").strip()[:1000]
    name = rec["name"]
    # Humanize the dept slug so the model doesn't echo "systems-synthetic-biology".
    dept = rec.get("department", "").replace("-", " ")

    # Include Scholar interests if available
    interests = rec.get("scholar_interests", [])
    interests_str = ""
    if interests:
        interests_str = f"\nGoogle Scholar interests: {', '.join(interests)}"

    prompt = (
        f"You are an academic writing assistant. Based on the following scraped research "
        f"information about a professor, write a comprehensive yet concise review (4-6 sentences) "
        f"of their research work that a student could read to quickly understand what this "
        f"professor does and what their lab focuses on. Write in third person. Be specific "
        f"about research topics and methods. Do not fabricate details beyond what is provided.\n\n"
        f"Professor: {name}\n"
        f"Department: {dept}\n"
        f"Research information: {cleaned}{interests_str}\n\n"
        f"Write the review as a single paragraph with no heading or bullet points."
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        # Basic sanity check
        if len(text) < 50:
            return None
        return text
    except Exception as exc:
        print(f"  ERROR: {type(exc).__name__}: {str(exc)[:200]}")
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", default="faculty.json",
                    help="Faculty JSON file to enrich in place (default: faculty.json).")
    ap.add_argument("--model", default=MODEL, help=f"Ollama model tag (default: {MODEL}).")
    args = ap.parse_args()

    faculty_json = Path(args.file)
    if not faculty_json.is_absolute():
        faculty_json = Path(__file__).parent / faculty_json
    if not faculty_json.exists():
        print(f"Error: {faculty_json} not found")
        sys.exit(1)

    data = json.loads(faculty_json.read_text(encoding="utf-8"))
    candidates = [(i, r) for i, r in enumerate(data) if needs_review(r)]

    print(f"Total records: {len(data)}")
    print(f"Need review: {len(candidates)}")

    if not candidates:
        print("Nothing to do.")
        return

    generated = 0
    errors = 0

    for idx, (rec_idx, rec) in enumerate(candidates):
        name = rec.get("name", "???")
        review = generate_review(rec, args.model)

        if review:
            data[rec_idx]["ai_review"] = review
            generated += 1
            print(f"  [{idx+1}/{len(candidates)}] {name} - OK")
        else:
            errors += 1
            print(f"  [{idx+1}/{len(candidates)}] {name} - FAILED")

        # Save progress periodically
        if generated > 0 and generated % SAVE_EVERY == 0:
            faculty_json.write_text(
                json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            print(f"  [checkpoint] Saved progress ({generated} reviews so far)")

    # Final save
    faculty_json.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nDone: {generated} reviews generated, {errors} errors. Saved to {faculty_json}")


if __name__ == "__main__":
    main()
