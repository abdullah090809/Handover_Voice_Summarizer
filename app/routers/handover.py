import os
import tempfile
import logging
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form, Request
from sqlalchemy.orm import Session

from app.cores.database import get_db
from app.cores.limiter import limiter
from app.cores.security import get_current_user
from app.models.handover_note import HandoverNote
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.schemas.handover_note import HandoverNoteAccepted, HandoverNoteOut
from app.tasks import process_handover_note

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

# Shared volume mounted into both the api and celery_worker containers —
# the OS-default temp dir is private per-container, which breaks Celery
# from being able to read a file the api container wrote. Override via
# AUDIO_UPLOAD_DIR for environments (CI, local dev outside Docker) where
# /app doesn't exist or isn't writable by the running user.
_UPLOAD_DIR = os.environ.get("AUDIO_UPLOAD_DIR", "/app/audio_uploads")
try:
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
except (PermissionError, OSError):
    _UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "audio_uploads")
    os.makedirs(_UPLOAD_DIR, exist_ok=True)


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
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=_UPLOAD_DIR)
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


@router.post(
    "/transcribe",
    response_model=HandoverNoteAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("20/hour")
def transcribe_handover_audio(
    request: Request,
    shift_id: int = Form(...),
    resident_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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

    # Guard against duplicate submissions (double-click, flaky-network retry, etc.)
    # racing to create two HandoverNote rows + two Celery tasks for the same
    # shift/resident before the first one has finished processing.
    existing_in_progress = (
        db.query(HandoverNote)
        .filter(
            HandoverNote.shift_id == shift_id,
            HandoverNote.resident_id == resident_id,
            HandoverNote.status.in_(["pending", "processing"]),
        )
        .first()
    )
    if existing_in_progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A handover note for this shift and resident is already being processed.",
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

    process_handover_note.delay(new_note.id, tmp_path)

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