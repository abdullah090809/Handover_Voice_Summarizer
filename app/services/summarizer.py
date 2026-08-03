import json
import logging
import random
import time

from google import genai
from google.genai import errors, types

from app.cores.config import settings
from app.cores.circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

# Circuit breaker: open after 3 consecutive Gemini failures, reset after 60s.
_gemini_cb = CircuitBreaker(name="gemini", failure_threshold=3, reset_timeout=60.0)

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

# Status codes worth retrying — transient/rate-limit conditions only.
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_BASE_DELAY_SECONDS = 2.0


class GeminiSummarizationError(Exception):
    """Base class for summarization failures."""


class GeminiQuotaExceededError(GeminiSummarizationError):
    """Rate limit / quota hit (HTTP 429). Transient — caller may retry later."""


class GeminiAccessDeniedError(GeminiSummarizationError):
    """Project/key denied access (HTTP 403). NOT transient — retrying won't help.
    Caller should stop retrying and surface this for investigation (billing,
    suspended project, revoked key, etc.) rather than looping."""


def _call_gemini(transcript: str):
    """Single call attempt, with backoff+jitter only on retryable errors."""
    last_exc: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            return client.models.generate_content(
                model="gemini-2.5-flash",
                contents=transcript,
                config=types.GenerateContentConfig(system_instruction=_SYSTEM_PROMPT),
            )
        except errors.ClientError as exc:
            status_code = getattr(exc, "code", None) or getattr(exc, "status_code", None)

            if status_code == 403:
                # Not transient — fail fast, don't burn retries on a dead key/project.
                logger.error("Gemini access denied (403): %s", exc)
                raise GeminiAccessDeniedError(str(exc)) from exc

            if status_code == 429:
                last_exc = exc
                if attempt == _MAX_RETRIES:
                    logger.warning("Gemini quota exceeded after %d attempts", attempt)
                    raise GeminiQuotaExceededError(str(exc)) from exc
                delay = _BASE_DELAY_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 1)
                logger.info(
                    "Gemini rate-limited (attempt %d/%d), backing off %.1fs",
                    attempt, _MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue

            if status_code in _RETRYABLE_STATUS_CODES:
                last_exc = exc
                if attempt == _MAX_RETRIES:
                    raise
                delay = _BASE_DELAY_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 1)
                logger.warning(
                    "Gemini transient error %s (attempt %d/%d), retrying in %.1fs",
                    status_code, attempt, _MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue

            # Non-retryable, non-403 client error (e.g. 400 bad request) — fail fast.
            logger.error("Gemini client error (%s): %s", status_code, exc)
            raise

    # Should be unreachable, but keeps type-checkers happy.
    raise last_exc  # type: ignore[misc]


def summarize_transcript(transcript: str) -> dict:
    # If the Gemini circuit breaker is open, fail fast rather than queueing
    # a call that is doomed to time out.
    try:
        response = _gemini_cb.call(_call_gemini, transcript)
    except CircuitOpenError as e:
        logger.error("Gemini circuit breaker is OPEN: %s", e)
        raise GeminiSummarizationError(str(e)) from e

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
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.exception("Gemini returned non-JSON output: %r", raw_text)
        raise

    from pydantic import BaseModel, Field
    from typing import List, Literal

    class StructuredSummary(BaseModel):
        resident_name: str | None = None
        summary: str = Field(..., max_length=5000)
        key_events: List[str] = Field(default_factory=list)
        medications_given: List[str] = Field(default_factory=list)
        incidents: List[str] = Field(default_factory=list)
        follow_up_actions: List[str] = Field(default_factory=list)
        mood_notes: str | None = None
        urgency_flag: Literal["low", "medium", "high", "urgent"] = "low"

    # Enforce Pydantic validation. Invalid schemas or injects raise ValidationError
    validated = StructuredSummary.model_validate(parsed)
    return validated.model_dump()