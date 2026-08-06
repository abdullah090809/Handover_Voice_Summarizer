"""
Unit tests for:
  - app.services.email  (send helpers)
  - app.services.summarizer  (JSON parsing, Pydantic validation, circuit breaker)
  - app.services.transcription  (preprocess / transcribe, happy & error paths)
  - app.cores.circuit_breaker  (state machine)
"""

import json
import smtplib
import subprocess
from unittest.mock import MagicMock, patch, call
from app.services.summarizer import GeminiOutputParseError
import pytest


# ============================================================
# app.cores.circuit_breaker
# ============================================================

class TestCircuitBreaker:
    def _make(self, failure_threshold=3, reset_timeout=60.0):
        from app.cores.circuit_breaker import CircuitBreaker
        return CircuitBreaker("test", failure_threshold=failure_threshold, reset_timeout=reset_timeout)

    def test_starts_closed(self):
        cb = self._make()
        assert cb.state == "CLOSED"

    def test_opens_after_threshold_failures(self):
        from app.cores.circuit_breaker import CircuitOpenError
        cb = self._make(failure_threshold=2)

        def bad():
            raise RuntimeError("boom")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                cb.call(bad)

        assert cb.state == "OPEN"
        with pytest.raises(CircuitOpenError):
            cb.call(bad)

    def test_resets_to_half_open_after_timeout(self):
        import time
        cb = self._make(failure_threshold=1, reset_timeout=0.01)

        with pytest.raises(RuntimeError):
            cb.call(lambda: (_ for _ in ()).throw(RuntimeError("x")))

        assert cb.state == "OPEN"
        time.sleep(0.05)
        assert cb.state == "HALF_OPEN"

    def test_success_resets_counter(self):
        cb = self._make(failure_threshold=3)

        def bad():
            raise RuntimeError("boom")

        # Two failures, then a success → counter resets
        for _ in range(2):
            with pytest.raises(RuntimeError):
                cb.call(bad)

        cb.call(lambda: "ok")
        assert cb.state == "CLOSED"
        assert cb._failure_count == 0

    def test_decorator_usage(self):
        from app.cores.circuit_breaker import CircuitBreaker
        cb = CircuitBreaker("deco", failure_threshold=5)

        @cb
        def my_fn(x):
            return x * 2

        assert my_fn(3) == 6


# ============================================================
# app.services.email
# ============================================================

class TestEmailService:
    def _reset_smtp_breaker(self):
        """Reset module-level circuit breaker between tests."""
        import app.services.email as email_mod
        email_mod._smtp_cb._state = "CLOSED"
        email_mod._smtp_cb._failure_count = 0
        email_mod._smtp_cb._opened_at = None

    def test_send_verification_email_calls_smtp(self):
        self._reset_smtp_breaker()
        mock_server = MagicMock()
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            from app.services.email import send_verification_email
            send_verification_email("user@test.com", "123456")

        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.sendmail.assert_called_once()

    def test_send_urgent_handover_email_escapes_html(self):
        self._reset_smtp_breaker()
        captured_bodies = []

        def fake_send_email(to_email, subject, html_body):
            captured_bodies.append(html_body)

        with patch("app.services.email._send_email", side_effect=fake_send_email):
            from app.services.email import send_urgent_handover_email
            send_urgent_handover_email(
                to_email="mgr@test.com",
                resident_name="<script>alert('xss')</script>",
                summary="Fell over.",
                note_id=42,
            )

        assert "&lt;script&gt;" in captured_bodies[0]
        assert "<script>" not in captured_bodies[0]

    def test_send_password_reset_email_contains_otp(self):
        self._reset_smtp_breaker()
        captured = []

        with patch("app.services.email._send_email", side_effect=lambda **kw: captured.append(kw)):
            # Call directly so we capture via _send_email mock
            pass

        mock_server = MagicMock()
        raw_msgs = []

        def fake_sendmail(frm, to, msg):
            raw_msgs.append(msg)

        mock_server.sendmail = fake_sendmail
        mock_server.starttls = MagicMock()
        mock_server.login = MagicMock()

        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.return_value.__enter__ = lambda s: mock_server
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)
            from app.services.email import send_password_reset_email
            send_password_reset_email("user@test.com", "654321")

        assert raw_msgs, "sendmail was not called"
        assert "654321" in raw_msgs[0]

    def test_smtp_circuit_breaker_opens_on_repeated_failures(self):
        self._reset_smtp_breaker()
        import app.services.email as email_mod
        email_mod._smtp_cb.failure_threshold = 2

        with patch("smtplib.SMTP", side_effect=smtplib.SMTPConnectError(421, "down")):
            for _ in range(2):
                with pytest.raises(smtplib.SMTPConnectError):
                    email_mod._send_email("a@b.com", "subj", "<p>body</p>")

        assert email_mod._smtp_cb.state == "OPEN"
        # Restore
        email_mod._smtp_cb.failure_threshold = 5


# ============================================================
# app.services.summarizer
# ============================================================

_VALID_SUMMARY = {
    "resident_name": "Jane Doe",
    "summary": "Routine shift, no incidents.",
    "translated_transcript": "Patient slept well.",
    "key_events": [],
    "medications_given": ["Paracetamol 500mg"],
    "incidents": [],
    "follow_up_actions": [],
    "mood_notes": "Calm",
    "urgency_flag": "low",
}


def _make_gemini_response(text: str | None):
    resp = MagicMock()
    resp.text = text
    return resp


class TestSummarizerService:
    def _reset_gemini_breaker(self):
        import app.services.summarizer as s
        s._gemini_cb._state = "CLOSED"
        s._gemini_cb._failure_count = 0
        s._gemini_cb._opened_at = None

    def test_valid_json_returns_parsed_dict(self):
        self._reset_gemini_breaker()
        raw = json.dumps(_VALID_SUMMARY)

        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.return_value = _make_gemini_response(raw)
            from app.services.summarizer import summarize_transcript
            result = summarize_transcript("Patient slept well.")

        assert result["urgency_flag"] == "low"
        assert result["resident_name"] == "Jane Doe"

    def test_markdown_json_code_fence_is_stripped(self):
        self._reset_gemini_breaker()
        fenced = f"```json\n{json.dumps(_VALID_SUMMARY)}\n```"

        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.return_value = _make_gemini_response(fenced)
            from app.services.summarizer import summarize_transcript
            result = summarize_transcript("Patient ate well.")

        assert result["summary"] == _VALID_SUMMARY["summary"]

    def test_invalid_json_raises(self):
        self._reset_gemini_breaker()
        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.return_value = _make_gemini_response("not json at all")
            from app.services.summarizer import summarize_transcript
            with pytest.raises(GeminiOutputParseError):
                summarize_transcript("Hello")

    def test_invalid_urgency_flag_raises_validation_error(self):
        self._reset_gemini_breaker()
        bad = {**_VALID_SUMMARY, "urgency_flag": "critical"}  # not in Literal

        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.return_value = _make_gemini_response(json.dumps(bad))
            from app.services.summarizer import summarize_transcript
            from pydantic import ValidationError
            with pytest.raises(GeminiOutputParseError):
                summarize_transcript("Bad urgency")

    def test_no_response_text_raises(self):
        self._reset_gemini_breaker()
        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.return_value = _make_gemini_response(None)
            from app.services.summarizer import summarize_transcript
            with pytest.raises(ValueError, match="no text content"):
                summarize_transcript("Silence")

    def test_gemini_403_raises_access_denied_immediately(self):
        self._reset_gemini_breaker()
        from google.genai import errors

        exc = errors.ClientError(code=403, response_json={})

        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.side_effect = exc
            from app.services.summarizer import summarize_transcript, GeminiAccessDeniedError
            with pytest.raises(GeminiAccessDeniedError):
                summarize_transcript("Test")

        # 403 is not retried — should only have been called once
        assert mock_client.models.generate_content.call_count == 1

    def test_gemini_circuit_breaker_opens_after_failures(self):
        self._reset_gemini_breaker()
        import app.services.summarizer as s
        s._gemini_cb.failure_threshold = 2

        from google.genai import errors

        exc = errors.ClientError(code=500, response_json={})

        with patch("app.services.summarizer.client") as mock_client:
            mock_client.models.generate_content.side_effect = exc
            from app.services.summarizer import summarize_transcript, GeminiSummarizationError, GeminiAccessDeniedError
            for _ in range(2):
                try:
                    summarize_transcript("x")
                except Exception:
                    pass

        assert s._gemini_cb.state == "OPEN"
        # Restore
        s._gemini_cb.failure_threshold = 3
        self._reset_gemini_breaker()


# ============================================================
# app.services.transcription
# ============================================================

class TestTranscriptionService:
    def test_transcribe_audio_returns_text(self):
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {"text": "  Patient is well  "}

        with patch("app.services.transcription.get_whisper_model", return_value=mock_model), \
             patch("app.services.transcription.preprocess_audio", return_value="/tmp/processed.wav"), \
             patch("os.remove"):
            from app.services.transcription import transcribe_audio
            result = transcribe_audio("/fake/input.wav")

        assert result == "Patient is well"

    def test_preprocess_audio_calls_ffmpeg(self):
        import tempfile
        import os

        fake_output = "/tmp/fake_output.wav"
        with patch("tempfile.mkstemp", return_value=(0, fake_output)), \
             patch("os.close"), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            from app.services.transcription import preprocess_audio
            result = preprocess_audio("/input/audio.mp3")

        assert result == fake_output
        cmd = mock_run.call_args[0][0]
        assert "ffmpeg" in cmd
        assert "-ar" in cmd
        assert "16000" in cmd

    def test_preprocess_audio_cleans_up_on_ffmpeg_failure(self):
        fake_output = "/tmp/fake_broken.wav"
        with patch("tempfile.mkstemp", return_value=(0, fake_output)), \
             patch("os.close"), \
             patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "ffmpeg", stderr=b"error")), \
             patch("os.remove") as mock_remove:
            from app.services.transcription import preprocess_audio
            with pytest.raises(subprocess.CalledProcessError):
                preprocess_audio("/bad/input.wav")

        mock_remove.assert_called_once_with(fake_output)

    def test_transcribe_audio_cleans_up_processed_file(self):
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {"text": "ok"}
        processed = "/tmp/processed_cleanup.wav"

        with patch("app.services.transcription.get_whisper_model", return_value=mock_model), \
             patch("app.services.transcription.preprocess_audio", return_value=processed), \
             patch("os.remove") as mock_remove:
            from app.services.transcription import transcribe_audio
            transcribe_audio("/input.wav")

        mock_remove.assert_called_once_with(processed)

    def test_get_whisper_model_loads_once(self):
        import app.services.transcription as t
        original = t._model
        t._model = None  # reset to force reload

        with patch("whisper.load_model", return_value=MagicMock()) as mock_load:
            m1 = t.get_whisper_model()
            m2 = t.get_whisper_model()

        assert m1 is m2  # same object — loaded only once
        assert mock_load.call_count == 1

        t._model = original  # restore
