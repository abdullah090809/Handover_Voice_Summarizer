import json
import logging
import os
import app.models
from app.cores.celery_app import celery_app
from app.cores.database import SessionLocal
from app.cores.redis_client import redis_client
from app.models.handover_note import HandoverNote
from app.models.notification import Notification
from app.models.resident import Resident
from app.models.user import User
from app.services.email import send_urgent_handover_email
from app.services.summarizer import summarize_transcript
from app.services.transcription import transcribe_audio

logger = logging.getLogger(__name__)

WS_CHANNEL = "ws_broadcast"


def _publish_ws(event: dict) -> None:
    try:
        redis_client.publish(WS_CHANNEL, json.dumps(event))
    except Exception:
        logger.exception("Failed to publish websocket event: %r", event)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_kwargs={"max_retries": 3},
)
def process_handover_note(self, note_id: int, tmp_path: str) -> None:
    db = SessionLocal()
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
        except Exception:
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
    finally:
        db.close()
        if os.path.exists(tmp_path):
            os.remove(tmp_path)