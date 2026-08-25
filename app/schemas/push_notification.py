from datetime import datetime
from pydantic import BaseModel, Field


class DeviceTokenRegister(BaseModel):
    push_token: str = Field(..., description="Expo push token (e.g. ExponentPushToken[xxx])")
    platform: str | None = Field(None, description="Device platform (e.g. ios, android)")
    device_id: str | None = Field(None, description="Optional unique device identifier")


class DeviceTokenUnregister(BaseModel):
    push_token: str = Field(..., description="Expo push token to unregister")


class DeviceTokenOut(BaseModel):
    id: int
    user_id: int
    push_token: str
    platform: str | None
    device_id: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None

    class Config:
        from_attributes = True
