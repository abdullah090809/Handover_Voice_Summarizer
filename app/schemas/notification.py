from datetime import datetime
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    message: str
    urgency_flag: str | None
    resident_id: int | None
    handover_note_id: int | None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
