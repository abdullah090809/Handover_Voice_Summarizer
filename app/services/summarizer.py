import json
import logging
import random
import time
from typing import List, Literal

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field, ValidationError

from app.cores.config import settings
from app.cores.circuit_breaker import CircuitBreaker, CircuitOpenError

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.gemini_api_key)

# Circuit breaker: open after 3 consecutive Gemini failures, reset after 60s.
_gemini_cb = CircuitBreaker(name="gemini", failure_threshold=3, reset_timeout=60.0)

_SYSTEM_PROMPT = """You are a care home shift-handover assistant. You will be given a raw \
transcript of a care worker's spoken handover note about a resident. The transcript may be \
in any language (e.g. English, Urdu, Arabic) and was produced by an automatic speech \
recognition (ASR) system, so it may contain misheard words — especially for non-English \
languages.

Convert it into a structured JSON report. Work in two stages, in this exact order:

STAGE 1 — Produce "translated_transcript" first:
- Translate the transcript faithfully into fluent English. Do not omit details just \
because they were in a different language.
- Do not translate the resident's proper name if one is mentioned; keep it as spoken.
- While translating, identify and correct words that are likely ASR mis-transcriptions \
(e.g. a nonsense word appearing where a common connector like "but" would make more \
sense, or a word that contradicts the rest of the sentence's meaning).
- When you are not confident about a correction, prefer the interpretation that is \
safest and most clinically conservative (e.g. treat an ambiguous word near terms like \
"fall" or "injury" as a possible safety concern rather than dismissing it), and mark \
your correction inline like [uncertain: your best guess].
- This field is the single source of truth for every field that follows — base Stage 2 \
entirely on what you wrote here, not on the raw transcript.

STAGE 2 — Using ONLY the translated_transcript from Stage 1, fill in the remaining fields \
(summary, key_events, medications_given, incidents, follow_up_actions, mood_notes, \
resident_name, urgency_flag). All of these must be written in English.

Respond with ONLY valid JSON, no markdown formatting, no code fences, no explanation \
text before or after. Match this exact schema, with keys in this exact order:

{
  "translated_transcript": "corrected, fully English version of the transcript, with [uncertain: word] markers on any ASR-error corrections you made",
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

# Separate, smaller retry budget for the case where the HTTP call succeeded
# but the model's output wasn't valid JSON / didn't match our schema. This
# is a generation-level glitch (a stray or corrupted token derails the
# output mid-structure) rather than a network/quota problem, so the fix is
# just to ask again — a fresh sample very often comes back clean. Retrying
# here (a ~15-20s Gemini call) is far cheaper than letting the exception
# propagate out of summarize_transcript, since that fails the whole Celery
# task and forces Whisper transcription to be redone from scratch too.
_MAX_PARSE_RETRIES = 2


class GeminiSummarizationError(Exception):
    """Base class for summarization failures."""


class GeminiOutputParseError(GeminiSummarizationError):
    """Gemini responded successfully but the output wasn't valid JSON matching
    our schema after all retry attempts. Usually a transient generation glitch
    (a corrupted/stray token mid-response) rather than a prompt or code bug."""


class StructuredSummary(BaseModel):
    translated_transcript: str = Field(..., max_length=10000)
    resident_name: str | None = None
    summary: str = Field(..., max_length=5000)
    key_events: List[str] = Field(default_factory=list)
    medications_given: List[str] = Field(default_factory=list)
    incidents: List[str] = Field(default_factory=list)
    follow_up_actions: List[str] = Field(default_factory=list)
    mood_notes: str | None = None
    urgency_flag: Literal["low", "medium", "high"] = "low"


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


def _parse_and_validate(raw_text: str) -> dict:
    """Parse a single Gemini response into our schema. Raises JSONDecodeError
    or pydantic ValidationError on malformed/unexpected output — caller
    decides whether to retry."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    parsed = json.loads(text)  # may raise JSONDecodeError
    validated = StructuredSummary.model_validate(parsed)  # may raise ValidationError
    return validated.model_dump()


def summarize_transcript(transcript: str) -> dict:
    last_exc: Exception | None = None

    for attempt in range(1, _MAX_PARSE_RETRIES + 1):
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

        raw_text = response.text

        try:
            return _parse_and_validate(raw_text)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_exc = exc
            if attempt == _MAX_PARSE_RETRIES:
                logger.error(
                    "Gemini output failed to parse/validate after %d attempt(s): %r",
                    attempt, raw_text,
                )
                raise GeminiOutputParseError(
                    f"Gemini output did not match expected schema after {attempt} attempt(s)"
                ) from exc

            # Malformed JSON / schema mismatch from a successful HTTP call is
            # usually a one-off generation glitch (e.g. a stray token
            # corrupting the structure mid-response) rather than something a
            # backoff delay fixes, so retry immediately with a fresh sample
            # rather than sleeping.
            logger.warning(
                "Gemini output failed to parse/validate (attempt %d/%d): %s. Retrying.",
                attempt, _MAX_PARSE_RETRIES, exc,
            )
            continue

    # Should be unreachable, but keeps type-checkers happy.
    raise GeminiOutputParseError(str(last_exc))