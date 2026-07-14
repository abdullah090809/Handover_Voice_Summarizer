from datetime import datetime
from typing import Any
from pydantic import BaseModel


class HandoverNoteOut(BaseModel):
    id: int
    shift_id: int
    resident_id: int | None
    raw_transcript: str | None
    summary_json: dict[str, Any] | None
    urgency_flag: str | None
    status: str
    error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class HandoverNoteAccepted(BaseModel):
    id: int
    status: str
