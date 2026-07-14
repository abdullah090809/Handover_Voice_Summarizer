import json
import logging

from google import genai
from google.genai import types

from app.cores.config import settings

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

_SYSTEM_PROMPT = """You are a care home shift-handover assistant. You will be given a raw \
transcript of a care worker's spoken handover note about a resident. Convert it into a \
structured JSON report.

Respond with ONLY valid JSON, no markdown formatting, no code fences, no explanation \
text before or after. Match this exact schema:

{
  "resident_name": "string or null",
  "summary": "one paragraph overview",
  "key_events": ["string"],
  "medications_given": ["string"],
  "incidents": ["string"],
  "follow_up_actions": ["string"],
  "mood_notes": "string or null",
  "urgency_flag": "low | medium | high"
}

Rules:
- If information for a field isn't mentioned in the transcript, use null for string \
fields or an empty array for list fields — do not invent details.
- urgency_flag should be "high" if there's a safety concern, injury, medication error, \
or urgent medical issue mentioned. "medium" for notable but non-urgent issues. "low" for \
a routine, uneventful handover.
"""


def summarize_transcript(transcript: str) -> dict:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=transcript,
        config=types.GenerateContentConfig(system_instruction=_SYSTEM_PROMPT),
    )
    raw_text = response.text.strip()

    # Gemini sometimes wraps JSON in markdown code fences despite instructions — strip them
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        # Issue #19 fix: log the actual malformed payload instead of letting
        # the caller's generic `except Exception` swallow it with no trace.
        logger.exception("Gemini returned non-JSON output: %r", raw_text)
        raise
