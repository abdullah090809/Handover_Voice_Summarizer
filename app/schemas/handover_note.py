from datetime import datetime
from typing import Any

from pydantic import BaseModel


class HandoverNoteOut(BaseModel):
    id: int
    shift_id: int
    resident_id: int | None
    raw_transcript: str
    summary_json: dict[str, Any]
    urgency_flag: str
    created_at: datetime

    class Config:
        from_attributes = True