from datetime import datetime

from pydantic import BaseModel


class ShiftCreate(BaseModel):
    start_time: datetime
    end_time: datetime | None = None


class ShiftOut(BaseModel):
    id: int
    worker_id: int
    start_time: datetime
    end_time: datetime | None = None

    class Config:
        from_attributes = True