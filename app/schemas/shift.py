from datetime import datetime

from pydantic import BaseModel, model_validator


class ShiftCreate(BaseModel):
    start_time: datetime
    end_time: datetime | None = None
    # IANA timezone name from the client (e.g. Intl.DateTimeFormat()
    # .resolvedOptions().timeZone in JS). Optional so old clients / API
    # callers that don't send it still work -- falls back server-side to
    # settings.app_timezone.
    timezone: str | None = None

    @model_validator(mode="after")
    def check_end_after_start(self):
        if self.end_time is not None and self.end_time < self.start_time:
            raise ValueError("end_time cannot be earlier than start_time")
        return self


class ShiftOut(BaseModel):
    id: int
    worker_id: int
    start_time: datetime
    end_time: datetime | None = None
    timezone: str | None = None
    # Computed at read time (see app.models.shift.compute_shift_numbers) —
    # not a database column. A stable, gap-free, per-worker ordinal for
    # display, since the raw `id` is a system-wide sequence and jumps
    # unpredictably from any one worker's perspective.
    shift_number: int | None = None

    class Config:
        from_attributes = True