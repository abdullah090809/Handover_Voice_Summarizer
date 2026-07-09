import json

import google.generativeai as genai

from app.cores.config import settings

genai.configure(api_key=settings.gemini_api_key)

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

_model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction=_SYSTEM_PROMPT,
)


def summarize_transcript(transcript: str) -> dict:
    response = _model.generate_content(transcript)
    raw_text = response.text.strip()

    # Gemini sometimes wraps JSON in markdown code fences despite instructions — strip them
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    return json.loads(raw_text)