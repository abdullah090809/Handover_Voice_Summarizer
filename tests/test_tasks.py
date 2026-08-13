from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.handover_note import HandoverNote
from app.models.notification import Notification
from app.models.pending_user import PendingUser
from app.models.user import User
from app.tasks import (
    _is_quota_error,
    cleanup_expired_pending_users,
    process_handover_note,
    send_password_reset_email_task,
    send_verification_email_task,
)

# NOTE: these tests call the task functions directly (bypassing .delay()/
# the broker entirely) so their actual bodies execute in-process -- the
# existing router-level tests all patch these tasks out wholesale, which is
# correct for router tests but means the task bodies themselves (retry
# logic, DB writes, error paths) were never exercised anywhere.


# ---------------------------------------------------------------------------
# send_verification_email_task / send_password_reset_email_task
# ---------------------------------------------------------------------------

def test_send_verification_email_task_success():
    with patch("app.tasks.send_verification_email") as mock_send:
        send_verification_email_task("user@test.com", "123456")
    mock_send.assert_called_once_with("user@test.com", "123456")


def test_send_verification_email_task_failure_reraises():
    with patch("app.tasks.send_verification_email", side_effect=RuntimeError("SMTP down")):
        with pytest.raises(RuntimeError, match="SMTP down"):
            send_verification_email_task("user@test.com", "123456")


def test_send_password_reset_email_task_success():
    with patch("app.tasks.send_password_reset_email") as mock_send:
        send_password_reset_email_task("user@test.com", "654321")
    mock_send.assert_called_once_with("user@test.com", "654321")


def test_send_password_reset_email_task_failure_reraises():
    with patch("app.tasks.send_password_reset_email", side_effect=RuntimeError("SMTP down")):
        with pytest.raises(RuntimeError, match="SMTP down"):
            send_password_reset_email_task("user@test.com", "654321")


# ---------------------------------------------------------------------------
# cleanup_expired_pending_users
# ---------------------------------------------------------------------------

def _make_pending_user(db_session, *, email, username, otp_expires_at):
    pending = PendingUser(
        email=email,
        username=username,
        password="hashed",
        otp_code="000000",
        otp_expires_at=otp_expires_at,
    )
    db_session.add(pending)
    db_session.commit()
    db_session.refresh(pending)
    return pending


def test_cleanup_expired_pending_users_deletes_only_past_grace_period(db_session):
    now = datetime.now(timezone.utc)
    # Expired more than 24h ago -- should be deleted.
    _make_pending_user(
        db_session,
        email="longexpired@test.com",
        username="longexpired",
        otp_expires_at=now - timedelta(hours=25),
    )
    # Expired recently (within the 24h grace period) -- should survive.
    _make_pending_user(
        db_session,
        email="recentlyexpired@test.com",
        username="recentlyexpired",
        otp_expires_at=now - timedelta(hours=1),
    )
    # Not expired at all -- should survive.
    _make_pending_user(
        db_session,
        email="notexpired@test.com",
        username="notexpired",
        otp_expires_at=now + timedelta(minutes=10),
    )

    deleted_count = cleanup_expired_pending_users()

    assert deleted_count == 1
    remaining_emails = {
        p.email for p in db_session.query(PendingUser).all()
    }
    assert remaining_emails == {"recentlyexpired@test.com", "notexpired@test.com"}


def test_cleanup_expired_pending_users_no_expired_returns_zero(db_session):
    now = datetime.now(timezone.utc)
    _make_pending_user(
        db_session, email="fresh@test.com", username="fresh", otp_expires_at=now + timedelta(minutes=10)
    )

    assert cleanup_expired_pending_users() == 0


def test_cleanup_expired_pending_users_empty_table_returns_zero(db_session):
    assert cleanup_expired_pending_users() == 0


def test_cleanup_expired_pending_users_rolls_back_and_reraises_on_error(monkeypatch):
    fake_db = MagicMock()
    fake_db.query.return_value.filter.return_value.delete.side_effect = RuntimeError("db exploded")
    monkeypatch.setattr("app.tasks.SessionLocal", lambda: fake_db)

    with pytest.raises(RuntimeError, match="db exploded"):
        cleanup_expired_pending_users()

    fake_db.rollback.assert_called_once()
    fake_db.close.assert_called_once()


# ---------------------------------------------------------------------------
# _is_quota_error -- regression coverage for the GeminiQuotaExceededError
# bug fix (summarize_transcript wraps 429s in this, not a raw ClientError)
# ---------------------------------------------------------------------------

def test_is_quota_error_recognizes_gemini_quota_exceeded_error():
    from app.services.summarizer import GeminiQuotaExceededError

    assert _is_quota_error(GeminiQuotaExceededError("429 quota hit")) is True


def test_is_quota_error_false_for_unrelated_exception():
    assert _is_quota_error(RuntimeError("something else broke")) is False


# ---------------------------------------------------------------------------
# process_handover_note -- edge cases not covered by the happy-path
# integration test in test_integration_celery.py
# ---------------------------------------------------------------------------

def test_process_handover_note_missing_note_is_a_noop(db_session):
    """A note_id that doesn't exist (e.g. already cleaned up) should
    return quietly -- never raise."""
    process_handover_note(999999, "/fake/path.wav")


def test_process_handover_note_already_complete_skips_reprocessing(
    db_session, test_shift, test_resident
):
    """Idempotency guard: a retry landing on an already-completed note
    must not re-transcribe/re-summarize/re-notify."""
    note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        status="complete",
        raw_transcript="already done",
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    with patch("app.tasks.transcribe_audio") as mock_transcribe:
        process_handover_note(note.id, "/fake/path.wav")

    mock_transcribe.assert_not_called()
    db_session.refresh(note)
    assert note.raw_transcript == "already done"


def test_process_handover_note_gemini_quota_exceeded_saves_transcript(
    db_session, test_shift, test_resident, tmp_path
):
    """When Gemini's quota is exhausted, summarize_transcript() raises
    GeminiQuotaExceededError (see app/services/summarizer.py) -- the note
    should still be marked complete with the raw transcript preserved,
    rather than marked failed, so the person can still read the raw
    notes."""
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="pending")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    from app.services.summarizer import GeminiQuotaExceededError

    with patch("app.tasks.transcribe_audio", return_value="Some transcript"), patch(
        "app.tasks.summarize_transcript",
        side_effect=GeminiQuotaExceededError("429 RESOURCE_EXHAUSTED"),
    ):
        process_handover_note(note.id, str(audio_path))

    db_session.refresh(note)
    assert note.status == "complete"
    assert note.raw_transcript == "Some transcript"
    assert "quota" in note.error_message.lower()


def test_process_handover_note_manager_email_failure_does_not_fail_task(
    db_session, test_shift, test_resident, test_manager, tmp_path
):
    """An urgent note should still be marked complete and notified even if
    emailing one manager blows up -- that failure is logged, not raised."""
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="pending")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    summary = {
        "resident_name": test_resident.name,
        "summary": "Fell during the night.",
        "key_events": [],
        "medications_given": [],
        "incidents": [],
        "follow_up_actions": [],
        "mood_notes": "Distressed",
        "urgency_flag": "high",
    }

    with patch("app.tasks.transcribe_audio", return_value="transcript"), patch(
        "app.tasks.summarize_transcript", return_value=summary
    ), patch("app.tasks.send_urgent_handover_email", side_effect=RuntimeError("SMTP down")):
        process_handover_note(note.id, str(audio_path))

    db_session.refresh(note)
    assert note.status == "complete"

    notification = (
        db_session.query(Notification)
        .filter(Notification.handover_note_id == note.id)
        .first()
    )
    assert notification is not None


def test_process_handover_note_urgent_notification_not_duplicated_on_retry(
    db_session, test_shift, test_resident, tmp_path
):
    """If a Notification for this note already exists (e.g. a prior
    attempt got partway through before a transient failure triggered a
    retry), re-running must not create a second one."""
    note = HandoverNote(
        shift_id=test_shift.id,
        resident_id=test_resident.id,
        status="pending",
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    db_session.add(
        Notification(
            message="Urgent handover note already recorded.",
            urgency_flag="high",
            resident_id=test_resident.id,
            handover_note_id=note.id,
        )
    )
    db_session.commit()

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    summary = {
        "resident_name": test_resident.name,
        "summary": "Fell during the night.",
        "key_events": [],
        "medications_given": [],
        "incidents": [],
        "follow_up_actions": [],
        "mood_notes": "Distressed",
        "urgency_flag": "high",
    }

    with patch("app.tasks.transcribe_audio", return_value="transcript"), patch(
        "app.tasks.summarize_transcript", return_value=summary
    ), patch("app.tasks.send_urgent_handover_email") as mock_email:
        process_handover_note(note.id, str(audio_path))

    mock_email.assert_not_called()
    count = (
        db_session.query(Notification)
        .filter(Notification.handover_note_id == note.id)
        .count()
    )
    assert count == 1


def test_process_handover_note_cleans_up_temp_file_on_success(
    db_session, test_shift, test_resident, tmp_path
):
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="pending")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    summary = {
        "resident_name": test_resident.name,
        "summary": "Routine.",
        "key_events": [],
        "medications_given": [],
        "incidents": [],
        "follow_up_actions": [],
        "mood_notes": "Calm",
        "urgency_flag": "low",
    }

    with patch("app.tasks.transcribe_audio", return_value="transcript"), patch(
        "app.tasks.summarize_transcript", return_value=summary
    ):
        process_handover_note(note.id, str(audio_path))

    assert not audio_path.exists()


def test_process_handover_note_temp_file_removal_failure_is_logged_not_raised(
    db_session, test_shift, test_resident, tmp_path, monkeypatch, caplog
):
    """os.remove() failing during temp-file cleanup must not surface as a
    task failure -- the note has already been fully processed by then."""
    note = HandoverNote(shift_id=test_shift.id, resident_id=test_resident.id, status="pending")
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake")

    summary = {
        "resident_name": test_resident.name,
        "summary": "Routine.",
        "key_events": [],
        "medications_given": [],
        "incidents": [],
        "follow_up_actions": [],
        "mood_notes": "Calm",
        "urgency_flag": "low",
    }

    monkeypatch.setattr("app.tasks.os.remove", MagicMock(side_effect=OSError("locked")))

    with patch("app.tasks.transcribe_audio", return_value="transcript"), patch(
        "app.tasks.summarize_transcript", return_value=summary
    ):
        # Should not raise despite os.remove failing internally.
        process_handover_note(note.id, str(audio_path))

    db_session.refresh(note)
    assert note.status == "complete"