from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
_PASSWORD_FIELD = Field(min_length=8, max_length=72)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = _PASSWORD_FIELD


class UserOut(BaseModel):
    email: str
    id: int
    created_at: datetime
    role: str

    model_config = ConfigDict(from_attributes=True)


class UserCreateByManager(BaseModel):
    email: EmailStr
    password: str = _PASSWORD_FIELD
    role: str = Field(default="care_worker", pattern="^(care_worker|manager)$")


class UserUpdateByManager(BaseModel):
    email: EmailStr | None = None
    role: str | None = Field(default=None, pattern="^(care_worker|manager)$")
    password: str | None = None


class UserLogin(BaseModel):
    username: str
    password: str


class VerifyOTP(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = _PASSWORD_FIELD


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = _PASSWORD_FIELD


class ResendOTP(BaseModel):
    email: EmailStr
