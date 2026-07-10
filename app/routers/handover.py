import os
import shutil
import tempfile
from datetime import date
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session
from app.cores.database import get_db
from app.cores.security import get_current_user
from app.models.handover_note import HandoverNote
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.schemas.handover_note import HandoverNoteOut
from app.services.email import send_urgent_handover_email
from app.services.summarizer import summarize_transcript
from app.services.transcription import transcribe_audio

router = APIRouter(prefix="/handover", tags=["Handover"])


@router.post("/transcribe", response_model=HandoverNoteOut, status_code=status.HTTP_201_CREATED)
def transcribe_handover_audio(
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

    suffix = os.path.splitext(audio.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = tmp.name

    try:
        transcript = transcribe_audio(tmp_path)
    finally:
        os.remove(tmp_path)

    try:
        structured_summary = summarize_transcript(transcript)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate structured summary from transcript",
        )

    new_note = HandoverNote(
        shift_id=shift_id,
        resident_id=resident_id,
        raw_transcript=transcript,
        summary_json=structured_summary,
        urgency_flag=structured_summary.get("urgency_flag", "low"),
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    if new_note.urgency_flag in ["high", "urgent"]:
        managers = (
            db.query(User)
            .filter(User.care_home_id == resident.care_home_id, User.role == "manager")
            .all()
        )
        summary_text = structured_summary.get("summary", "")
        for manager in managers:
            try:
                send_urgent_handover_email(
                    to_email=manager.email,
                    resident_name=resident.name,
                    summary=summary_text,
                    note_id=new_note.id,
                )
            except Exception:
                pass

    return new_note


@router.get("/", response_model=list[HandoverNoteOut])
def list_handover_notes(
    resident_id: int | None = Query(None),
    urgency_flag: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
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

    return query.order_by(HandoverNote.created_at.desc()).all()


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