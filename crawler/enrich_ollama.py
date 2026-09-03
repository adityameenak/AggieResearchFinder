#!/usr/bin/env python3
"""
Enrich a faculty JSON file with AI-generated research reviews using a local
Ollama model. Re-runnable: replaces formulaic template reviews and fills
missing ones.

Usage:
  python enrich_ollama.py                      # default: faculty.json (TAMU)
  python enrich_ollama.py --file faculty-rice.json
  python enrich_ollama.py --file faculty-rice.json --model gemma3:4b

The model does not have to run on this machine. Point --host (or OLLAMA_HOST)
at a box with a real GPU and the run goes there instead:

  OLLAMA_HOST=http://192.168.1.42:11434 python enrich_ollama.py --file faculty-ut-extra.json
  python enrich_ollama.py --host http://192.168.1.42:11434 --model gemma3:12b

That machine needs OLLAMA_HOST=0.0.0.0 set for its own server, or it only
listens on its loopback and refuses everything from the network.
"""
import argparse, json, os, sys, time
from pathlib import Path
import requests

DEFAULT_HOST = "http://localhost:11434"
MODEL = "gemma3:4b"
SAVE_EVERY = 25


def api_url(host):
    """Accept a bare host, a host:port, or a full URL — all mean the same thing."""
    host = (host or DEFAULT_HOST).strip().rstrip("/")
    if not host.startswith(("http://", "https://")):
        host = f"http://{host}"
    if ":" not in host.split("//", 1)[1]:
        host = f"{host}:11434"
    return f"{host}/api/generate"


def preflight(host, model):
    """Fail loudly before a long run rather than once per record.

    A remote box that is up but hasn't pulled the model gives an error on every
    single request, so a 371-record run would otherwise take an hour to report
    that nothing was ever going to work.
    """
    tags = api_url(host).replace("/api/generate", "/api/tags")
    try:
        resp = requests.get(tags, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        print(f"Error: no Ollama at {host} ({type(exc).__name__}: {str(exc)[:120]})")
        print("  local:  ollama serve")
        print("  remote: set OLLAMA_HOST=0.0.0.0 on that machine and open port 11434")
        return False
    have = [m.get("name", "") for m in resp.json().get("models", [])]
    if model not in have and model.split(":")[0] not in [h.split(":")[0] for h in have]:
        print(f"Error: {host} has no model {model!r}. Installed: {', '.join(have) or '(none)'}")
        print(f"  on that machine: ollama pull {model}")
        return False
    return True


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


def generate_review(rec, model=MODEL, url=None):
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
            url or api_url(None),
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
    ap.add_argument("--host", default=os.environ.get("OLLAMA_HOST", DEFAULT_HOST),
                    help="Ollama server, e.g. http://192.168.1.42:11434 "
                         "(default: $OLLAMA_HOST or localhost).")
    args = ap.parse_args()

    url = api_url(args.host)
    if not preflight(args.host, args.model):
        sys.exit(1)
    print(f"Using {url} with model {args.model}")

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
        review = generate_review(rec, args.model, url)

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
