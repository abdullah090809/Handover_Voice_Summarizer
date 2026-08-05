from datetime import datetime
from typing import Any
from pydantic import BaseModel


class HandoverSubmitter(BaseModel):
    id: int
    name: str | None
    username: str
    profile_photo_url: str | None

    class Config:
        from_attributes = True


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
    resolved_follow_ups: list[str] = []
    # Who recorded this handover. Populated by the router via a join on
    # Shift.worker_id — not a real column on HandoverNote — so it's always
    # optional and defaults to None if a caller builds this schema without
    # attaching it.
    submitted_by: HandoverSubmitter | None = None

    class Config:
        from_attributes = True


class FollowUpResolution(BaseModel):
    action: str
    resolved: bool


class HandoverNoteAccepted(BaseModel):
    id: int
    status: str


class HandoverNotePagination(BaseModel):
    total: int
    results: list[HandoverNoteOut]
