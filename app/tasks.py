import json
import logging
import os
from datetime import datetime, timedelta, timezone
import app.models
from google.genai.errors import ClientError
from app.cores.celery_app import celery_app
from app.cores.database import SessionLocal
from app.cores.redis_client import redis_client
from app.models.handover_note import HandoverNote
from app.models.notification import Notification
from app.models.pending_user import PendingUser
from app.models.resident import Resident
from app.models.user import User
from app.services.email import send_urgent_handover_email, send_verification_email, send_password_reset_email
from app.services.summarizer import summarize_transcript
from app.services.transcription import transcribe_audio

logger = logging.getLogger(__name__)

WS_CHANNEL = "ws_broadcast"


@celery_app.task
def send_verification_email_task(to_email: str, otp_code: str) -> None:
    try:
        send_verification_email(to_email, otp_code)
    except Exception as e:
        logger.error(f"Async verification email sending failed: {e}")
        raise


@celery_app.task
def send_password_reset_email_task(to_email: str, otp_code: str) -> None:
    try:
        send_password_reset_email(to_email, otp_code)
    except Exception as e:
        logger.error(f"Async password reset email sending failed: {e}")
        raise


@celery_app.task
def cleanup_expired_pending_users() -> int:
    """Runs on a schedule (see celery_app.conf.beat_schedule). Deletes
    pending_users rows that have been sitting unverified for a while --
    i.e. someone started registering but never came back to verify.
    Without this, an abandoned signup permanently reserves its
    username/email in pending_users forever, since the row is otherwise
    only ever deleted on successful verify.

    We don't delete the instant otp_expires_at passes (that's only 10
    minutes -- see security.get_otp_expiry) because someone who requested
    a code and comes back later to hit "resend" should still find their
    in-progress signup. Instead we wait a grace period past expiry
    before treating it as truly abandoned.

    otp_expires_at is a tz-aware UTC timestamptz column, and Postgres
    timestamptz comparisons are done in absolute time regardless of the
    server's local OS timezone -- so this is correct no matter what
    timezone the API/worker container or the person registering is in.
    """
    grace_period = timedelta(hours=24)
    cutoff = datetime.now(timezone.utc) - grace_period

    db = SessionLocal()
    try:
        deleted = (
            db.query(PendingUser)
            .filter(PendingUser.otp_expires_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info(f"cleanup_expired_pending_users: removed {deleted} expired pending signup(s)")
        return deleted
    except Exception:
        db.rollback()
        logger.exception("cleanup_expired_pending_users failed")
        raise
    finally:
        db.close()


@celery_app.task
def cleanup_expired_pending_users() -> int:
    """Runs on a schedule (see celery_app.conf.beat_schedule). Deletes
    pending_users rows that have been sitting unverified for a while —
    i.e. someone started registering but never came back to verify.
    Without this, an abandoned signup permanently reserves its
    username/email in pending_users forever, since the row is otherwise
    only ever deleted on successful verify.

    We don't delete the instant otp_expires_at passes (that's only 10
    minutes — see security.get_otp_expiry) because someone who requested
    a code and comes back later to hit "resend" should still find their
    in-progress signup. Instead we wait a grace period past expiry
    before treating it as truly abandoned.

    otp_expires_at is a tz-aware UTC timestamptz column, and Postgres
    timestamptz comparisons are done in absolute time regardless of the
    server's local OS timezone — so this is correct no matter what
    timezone the API/worker container or the person registering is in.
    """
    grace_period = timedelta(hours=24)
    cutoff = datetime.now(timezone.utc) - grace_period

    db = SessionLocal()
    try:
        deleted = (
            db.query(PendingUser)
            .filter(PendingUser.otp_expires_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info(f"cleanup_expired_pending_users: removed {deleted} expired pending signup(s)")
        return deleted
    except Exception:
        db.rollback()
        logger.exception("cleanup_expired_pending_users failed")
        raise
    finally:
        db.close()



def _publish_ws(event: dict) -> None:
    try:
        redis_client.publish(WS_CHANNEL, json.dumps(event))
    except Exception:
        logger.exception("Failed to publish websocket event: %r", event)


def _should_cleanup_temp_file(task, task_failed_with_exception: bool) -> bool:
    if not task_failed_with_exception:
        return True
    retries = getattr(getattr(task, "request", None), "retries", 0)
    max_retries = getattr(task, "max_retries", 3)
    if max_retries is not None and retries < max_retries:
        return False
    return True


def _is_quota_error(exc: Exception) -> bool:
    return "RESOURCE_EXHAUSTED" in str(exc) or "429" in str(exc)


@celery_app.task(
    bind=True,
    acks_late=True,          # only ack after the task completes; a worker restart mid-job will
                             # re-queue the task from the broker rather than silently losing it.
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_kwargs={"max_retries": 3},
)
def process_handover_note(self, note_id: int, tmp_path: str) -> None:
    db = SessionLocal()
    task_failed_with_exception = False
    try:
        note = db.query(HandoverNote).filter(HandoverNote.id == note_id).first()
        if note is None:
            logger.error("Celery handover processing: note %s not found", note_id)
            return

        # Idempotency guard: if a previous attempt already finished the
        # transcription/summarization/notification pipeline for this note,
        # a retry triggered by a later transient failure should not redo it
        # (re-transcribing, re-billing the summarizer, or duplicating
        # manager emails/notifications).
        if note.status == "complete":
            logger.info("Note %s already complete, skipping reprocessing", note_id)
            return

        note.status = "processing"  # pyrefly: ignore [bad-assignment]
        db.commit()
        _publish_ws({"type": "handover_updated", "id": note_id, "status": "processing"})

        try:
            transcript = transcribe_audio(tmp_path)
        except Exception:
            logger.exception("Whisper transcription failed for note %s", note_id)
            note.status = "failed"  # pyrefly: ignore [bad-assignment]
            note.error_message = "Audio transcription failed"  # pyrefly: ignore [bad-assignment]
            db.commit()
            _publish_ws({"type": "handover_updated", "id": note_id, "status": "failed"})
            raise

        try:
            structured_summary = summarize_transcript(transcript)
        except (ClientError, Exception) as e:
            if isinstance(e, ClientError) and _is_quota_error(e):
                logger.warning(
                    "Gemini quota exceeded for note %s; saving transcript without summary", note_id
                )
                note.raw_transcript = transcript  # pyrefly: ignore [bad-assignment]
                note.status = "complete"  # pyrefly: ignore [bad-assignment]
                note.error_message = "Summary unavailable: Gemini API quota reached. Transcript saved."  # pyrefly: ignore [bad-assignment]
                db.commit()
                db.refresh(note)
                _publish_ws({"type": "handover_updated", "id": note_id, "status": "complete"})
                return

            logger.exception("Gemini summarization failed for note %s", note_id)
            note.status = "failed"  # pyrefly: ignore [bad-assignment]
            note.raw_transcript = transcript  # pyrefly: ignore [bad-assignment]
            note.error_message = "Structured summary generation failed"  # pyrefly: ignore [bad-assignment]
            db.commit()
            _publish_ws({"type": "handover_updated", "id": note_id, "status": "failed"})
            raise

        note.raw_transcript = transcript  # pyrefly: ignore [bad-assignment]
        note.summary_json = structured_summary  # pyrefly: ignore [bad-assignment]
        note.urgency_flag = structured_summary.get("urgency_flag", "low")
        note.status = "complete"  # pyrefly: ignore [bad-assignment]
        db.commit()
        db.refresh(note)

        _publish_ws({"type": "handover_updated", "id": note_id, "status": "complete"})

        if note.urgency_flag in ("high", "urgent"):
            # Extra guard: even within a single successful run this should
            # only ever fire once, but if a retry somehow reaches this point
            # again, don't create a second Notification for the same note.
            existing_notification = (
                db.query(Notification)
                .filter(Notification.handover_note_id == note.id)
                .first()
            )
            if existing_notification is None:
                resident = db.query(Resident).filter(Resident.id == note.resident_id).first()
                resident_name = resident.name if resident else "Unknown Resident"
                summary_text = structured_summary.get("summary", "")

                db_notification = Notification(
                    message=f"Urgent handover note #{note.id} recorded for resident {resident_name}.",
                    urgency_flag=note.urgency_flag,
                    resident_id=note.resident_id,
                    handover_note_id=note.id,
                )
                db.add(db_notification)
                db.commit()
                db.refresh(db_notification)

                _publish_ws({
                    "type": "notification",
                    "id": db_notification.id,
                    "message": db_notification.message,
                    "urgency_flag": db_notification.urgency_flag,
                    "resident_id": note.resident_id,
                })

                managers = db.query(User).filter(User.role == "manager").all()
                for manager_user in managers:
                    try:
                        send_urgent_handover_email(
                            to_email=str(manager_user.email),
                            resident_name=str(resident_name),
                            summary=summary_text,
                            note_id=note.id,
                        )
                    except Exception:
                        logger.exception(
                            "Failed to send urgent handover email",
                            extra={"manager_email": manager_user.email, "note_id": note.id},
                        )
            else:
                logger.info(
                    "Notification already exists for note %s, skipping duplicate", note_id
                )
    except Exception:
        task_failed_with_exception = True
        raise
    finally:
        db.close()
        if _should_cleanup_temp_file(self, task_failed_with_exception):
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    logger.exception("Failed to remove temp file %s", tmp_path)