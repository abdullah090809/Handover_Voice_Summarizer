import os
import shutil
import tempfile
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.services.transcription import transcribe_audio


router = APIRouter(prefix="/handover", tags=["Handover"])

@router.post("/transcribe")
def transcribe_handover_audio(
    shift_id: int = Form(...),
    resident_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate the shift belongs to the current user
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

    # Validate the resident exists
    resident = db.query(Resident).filter(Resident.id == resident_id).first()
    if not resident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resident with id {resident_id} not found",
        )

    # Save uploaded audio to a temp file, transcribe, then delete it
    suffix = os.path.splitext(audio.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    try:
        transcript = transcribe_audio(tmp_path)
    finally:
        os.remove(tmp_path)

    return {
        "shift_id": shift_id,
        "resident_id": resident_id,
        "transcript": transcript,
    }