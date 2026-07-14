import asyncio
import os
import tempfile
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form, BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.cores.database import get_db, SessionLocal
from app.cores.limiter import limiter
from app.cores.security import get_current_user
from app.models.handover_note import HandoverNote
from app.models.resident import Resident
from app.models.notification import Notification
from app.models.shift import Shift
from app.models.user import User
from app.schemas.handover_note import HandoverNoteAccepted, HandoverNoteOut
from app.services.transcription import transcribe_audio
from app.services.summarizer import summarize_transcript
from app.services.email import send_urgent_handover_email
from app.routers.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/handover", tags=["Handover Notes"])

ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/m4a",
    "audio/x-m4a",
    "audio/webm",
    "audio/ogg",
    "application/octet-stream",
}
ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _save_upload_to_tempfile(audio: UploadFile) -> str:
    if audio.content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio content type: {audio.content_type}",
        )

    suffix = os.path.splitext(audio.filename or "")[1].lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        suffix = ".wav"

    size = 0
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        while chunk := audio.file.read(_UPLOAD_CHUNK_SIZE):
            size += len(chunk)
            if size > MAX_AUDIO_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Audio file exceeds the 25 MB upload limit",
                )
            tmp.write(chunk)
    except HTTPException:
        tmp.close()
        os.remove(tmp.name)
        raise
    else:
        tmp.close()
        return tmp.name


def _process_handover_note(note_id: int, tmp_path: str, main_loop: asyncio.AbstractEventLoop) -> None:
    db: Session = SessionLocal()
    try:
        note = db.query(HandoverNote).filter(HandoverNote.id == note_id).first()
        if note is None:
            logger.error("Background handover processing: note %s not found", note_id)
            return

        note.status = "processing"
        db.commit()

        try:
            transcript = transcribe_audio(tmp_path)
        except Exception:
            logger.exception("Whisper transcription failed for note %s", note_id)
            note.status = "failed"
            note.error_message = "Audio transcription failed"
            db.commit()
            try:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(f'{{"type": "handover_updated", "id": {note_id}, "status": "failed"}}'),
                    main_loop
                )
            except Exception as e:
                logger.error(f"WebSocket broadcast failed: {e}")
            return

        try:
            structured_summary = summarize_transcript(transcript)
        except Exception:
            logger.exception("Gemini summarization failed for note %s", note_id)
            note.status = "failed"
            note.raw_transcript = transcript
            note.error_message = "Structured summary generation failed"
            db.commit()
            try:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(f'{{"type": "handover_updated", "id": {note_id}, "status": "failed"}}'),
                    main_loop
                )
            except Exception as e:
                logger.error(f"WebSocket broadcast failed: {e}")
            return

        note.raw_transcript = transcript
        note.summary_json = structured_summary
        note.urgency_flag = structured_summary.get("urgency_flag", "low")
        note.status = "complete"
        db.commit()
        db.refresh(note)

        # Notify via WebSocket about handover completion
        try:
            asyncio.run_coroutine_threadsafe(
                manager.broadcast(f'{{"type": "handover_updated", "id": {note_id}, "status": "complete"}}'),
                main_loop
            )
        except Exception as e:
            logger.error(f"WebSocket broadcast failed: {e}")

        # Check for safety-relevant notifications for high/urgent urgency
        if note.urgency_flag in ("high", "urgent"):
            resident = db.query(Resident).filter(Resident.id == note.resident_id).first()
            resident_name = resident.name if resident else "Unknown Resident"
            summary_text = structured_summary.get("summary", "")

            # Create internal database Notification for Managers
            db_notification = Notification(
                message=f"Urgent handover note #{note.id} recorded for resident {resident_name}.",
                urgency_flag=note.urgency_flag,
                resident_id=note.resident_id,
                handover_note_id=note.id,
            )
            db.add(db_notification)
            db.commit()
            db.refresh(db_notification)

            try:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(f'{{"type": "notification", "id": {db_notification.id}, "message": "{db_notification.message}", "urgency_flag": "{db_notification.urgency_flag}", "resident_id": {note.resident_id or "null"}}}'),
                    main_loop
                )
            except Exception as e:
                logger.error(f"WebSocket notification broadcast failed: {e}")

            # Send Email alerts to all managers
            managers = db.query(User).filter(User.role == "manager").all()
            for manager_user in managers:
                try:
                    send_urgent_handover_email(
                        to_email=manager_user.email,
                        resident_name=resident_name,
                        summary=summary_text,
                        note_id=note.id,
                    )
                except Exception:
                    logger.exception(
                        "Failed to send urgent handover email",
                        extra={"manager_email": manager_user.email, "note_id": note.id},
                    )
    finally:
        db.close()
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.post(
    "/transcribe",
    response_model=HandoverNoteAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("20/hour")
def transcribe_handover_audio(
    request: Request,
    background_tasks: BackgroundTasks,
    shift_id: int = Form(...),
    resident_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Requirement: Managers should NOT record notes or upload handovers
    if current_user.role == "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers are not allowed to submit shift handovers.",
        )

    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shift with id {shift_id} not found",
        )
    if shift.worker_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This shift does not belong to you",
        )

    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {resident_id} not found",
        )

    tmp_path = _save_upload_to_tempfile(audio)

    new_note = HandoverNote(
        shift_id=shift_id,
        resident_id=resident_id,
        status="pending",
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    main_loop = request.app.state.main_loop
    background_tasks.add_task(_process_handover_note, new_note.id, tmp_path, main_loop)

    return new_note


@router.get("/", response_model=list[HandoverNoteOut])
def list_handover_notes(
    resident_id: int | None = Query(None),
    urgency_flag: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(HandoverNote)
    if resident_id is not None:
        query = query.filter(HandoverNote.resident_id == resident_id)
    if urgency_flag is not None:
        query = query.filter(HandoverNote.urgency_flag == urgency_flag)
    if date_from is not None:
        query = query.filter(HandoverNote.created_at >= date_from)
    if date_to is not None:
        query = query.filter(HandoverNote.created_at <= date_to)

    return (
        query.order_by(HandoverNote.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{id}", response_model=HandoverNoteOut)
def get_handover_note(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = db.query(HandoverNote).filter(HandoverNote.id == id).first()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Handover note with id {id} not found",
        )
    return note


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_handover_note(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only managers can delete handover notes",
        )

    note = db.query(HandoverNote).filter(HandoverNote.id == id).first()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Handover note with id {id} not found",
        )

    db.delete(note)
    db.commit()
    return None