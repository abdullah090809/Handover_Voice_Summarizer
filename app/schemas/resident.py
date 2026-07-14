from datetime import datetime
from pydantic import BaseModel
from typing import Literal


class ResidentCreate(BaseModel):
    name: str


class ResidentOut(BaseModel):
    id: int
    name: str
    status: str
    discharged_at: datetime | None = None

    class Config:
        from_attributes = True


class ResidentStatusUpdate(BaseModel):
    status: Literal["active", "discharged", "deceased"]