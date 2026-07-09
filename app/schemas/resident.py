from pydantic import BaseModel


class ResidentCreate(BaseModel):
    name: str
    care_home_id: int


class ResidentOut(BaseModel):
    id: int
    name: str
    care_home_id: int

    class Config:
        from_attributes = True