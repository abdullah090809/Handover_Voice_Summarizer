import logging
import os
import tempfile
from datetime import date

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.cores.database import SessionLocal, get_db
from app.cores.security import get_current_user
from app.models.handover_note import HandoverNote
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.schemas.handover_note import HandoverNoteAccepted, HandoverNoteOut
from app.services.email import send_urgent_handover_email
from app.services.summarizer import summarize_transcript
from app.services.transcription import transcribe_audio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/handover", tags=["Handover"])

# Issue #13 fix: allow-list of accepted upload content types and a hard size cap.
ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/webm",
    "audio/ogg",
}
ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}
MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB
_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _save_upload_to_tempfile(audio: UploadFile) -> str:
    """
    Issue #13 fix: validate content-type against an allow-list and stream the
    upload to disk in fixed-size chunks, rejecting it as soon as it exceeds
    MAX_AUDIO_BYTES instead of buffering an unbounded file first.
    """
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


def _process_handover_note(note_id: int, tmp_path: str) -> None:
    """
    Issue #14 fix: the slow, CPU/network-bound work (Whisper transcription +
    Gemini summarization) runs here, off the request/response cycle, using
    its own DB session since the request-scoped session from `get_db` is
    already closed by the time a background task runs.
    """
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
            return

        try:
            structured_summary = summarize_transcript(transcript)
        except Exception:
            logger.exception("Gemini summarization failed for note %s", note_id)
            note.status = "failed"
            note.raw_transcript = transcript
            note.error_message = "Structured summary generation failed"
            db.commit()
            return

        note.raw_transcript = transcript
        note.summary_json = structured_summary
        note.urgency_flag = structured_summary.get("urgency_flag", "low")
        note.status = "complete"
        db.commit()
        db.refresh(note)

        if note.urgency_flag in ("high", "urgent"):
            resident = db.query(Resident).filter(Resident.id == note.resident_id).first()
            care_home_id = resident.care_home_id if resident else None
            managers = (
                db.query(User)
                .filter(User.care_home_id == care_home_id, User.role == "manager")
                .all()
            )
            summary_text = structured_summary.get("summary", "")
            for manager in managers:
                try:
                    send_urgent_handover_email(
                        to_email=manager.email,
                        resident_name=resident.name if resident else None,
                        summary=summary_text,
                        note_id=note.id,
                    )
                except Exception:
                    # Issue #19 fix: log instead of silently discarding the
                    # failure of a safety-relevant notification.
                    logger.exception(
                        "Failed to send urgent handover email",
                        extra={"manager_email": manager.email, "note_id": note.id},
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
def transcribe_handover_audio(
    background_tasks: BackgroundTasks,
    shift_id: int = Form(...),
    resident_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    # Issue #3 fix: a non-manager may only record a handover note for a
    # resident in their own care home.
    if current_user.role != "manager" and resident.care_home_id != current_user.care_home_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to record a handover note for this resident",
        )

    tmp_path = _save_upload_to_tempfile(audio)

    # Issue #14 fix: create the row immediately in "pending" state and hand
    # the slow work off to a background task instead of blocking this
    # request on Whisper + Gemini.
    new_note = HandoverNote(
        shift_id=shift_id,
        resident_id=resident_id,
        status="pending",
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    background_tasks.add_task(_process_handover_note, new_note.id, tmp_path)

    return new_note


@router.get("/", response_model=list[HandoverNoteOut])
def list_handover_notes(
    resident_id: int | None = Query(None),
    urgency_flag: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    # Issue #11 fix: bounded pagination.
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Issue #3 fix: join to Resident so results can be scoped to the
    # caller's care home instead of returning every note in the system.
    query = db.query(HandoverNote).join(Resident, HandoverNote.resident_id == Resident.id)

    if current_user.role != "manager":
        query = query.filter(Resident.care_home_id == current_user.care_home_id)
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

    # Issue #3 fix: deny access to notes belonging to residents outside the
    # caller's care home.
    if current_user.role != "manager":
        resident = db.query(Resident).filter(Resident.id == note.resident_id).first()
        if resident is None or resident.care_home_id != current_user.care_home_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this handover note",
            )

    return note
