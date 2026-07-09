from pydantic import BaseModel


class CareHomeCreate(BaseModel):
    name: str
    address: str | None = None


class CareHomeOut(BaseModel):
    id: int
    name: str
    address: str | None = None

    class Config:
        from_attributes = True