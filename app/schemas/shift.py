from datetime import datetime

from pydantic import BaseModel, model_validator


class ShiftCreate(BaseModel):
    start_time: datetime
    end_time: datetime | None = None

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
    # Computed at read time (see app.models.shift.compute_shift_numbers) —
    # not a database column. A stable, gap-free, per-worker ordinal for
    # display, since the raw `id` is a system-wide sequence and jumps
    # unpredictably from any one worker's perspective.
    shift_number: int | None = None

    class Config:
        from_attributes = True