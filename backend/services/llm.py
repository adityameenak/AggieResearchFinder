"""
LLM client wrapper — uses Anthropic Claude when ANTHROPIC_API_KEY is set,
falls back to mock/stub responses automatically when not set.
"""
import os
import json

_client = None
MOCK_MODE = not bool(os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-haiku-4-5-20251001"


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()
    return _client


def chat(system: str, user: str, max_tokens: int = 1024) -> str:
    """Call Claude and return the response text. Falls back to empty string in mock mode."""
    if MOCK_MODE:
        raise RuntimeError("LLM not available: ANTHROPIC_API_KEY is not set.")
    client = _get_client()
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return message.content[0].text


def chat_json(system: str, user: str, max_tokens: int = 1024) -> dict:
    """Call Claude and parse the JSON response."""
    text = chat(system, user, max_tokens)
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0].strip()
    return json.loads(text)
