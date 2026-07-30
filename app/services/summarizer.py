import json
import logging

from google import genai
from google.genai import types

from app.cores.config import settings

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

_SYSTEM_PROMPT = """You are a care home shift-handover assistant. You will be given a raw \
transcript of a care worker's spoken handover note about a resident. The transcript may be \
in any language (e.g. English, Urdu, Arabic). Convert it into a structured JSON report.

IMPORTANT: Regardless of the transcript's language, all text in your JSON output \
(summary, key_events, medications_given, incidents, follow_up_actions, mood_notes, \
resident_name) must be written in English. Translate faithfully — do not omit details \
just because they were in a different language. Do not translate the resident's proper \
name if one is mentioned; keep it as spoken.

NOTE ON TRANSCRIPTION ACCURACY: This transcript was produced by an automatic speech \
recognition system and may contain misheard words, especially for non-English languages. \
Use context to identify and correct words that are likely mis-transcriptions of a \
similar-sounding word (for example, a nonsense word appearing where a common connector \
like "but" would make more sense, or a word that contradicts the rest of the sentence's \
meaning). When you are not confident about correcting a word, prefer the interpretation \
that is safest and most clinically conservative (e.g. treat an ambiguous word near terms \
like "fall" or "injury" as a possible safety concern rather than dismissing it) rather than \
silently guessing.

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
    if response.text is None:
        logger.error("Gemini returned no text content (possibly blocked or empty response)")
        raise ValueError("Gemini returned no text content")

    raw_text = response.text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
        raw_text = raw_text.strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        logger.exception("Gemini returned non-JSON output: %r", raw_text)
        raise