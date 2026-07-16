from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
_PASSWORD_FIELD = Field(min_length=8, max_length=72)
_USERNAME_FIELD = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")


class UserCreate(BaseModel):
    email: EmailStr
    username: str = _USERNAME_FIELD
    password: str = _PASSWORD_FIELD
    name: str | None = None


class UserUpdateSelf(BaseModel):
    name: str | None = None
    username: str | None = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = Field(default=None, max_length=1000)
    profile_photo_url: str | None = None


class UserOut(BaseModel):
    email: str
    username: str
    id: int
    created_at: datetime
    role: str
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = None
    profile_photo_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserCreateByManager(BaseModel):
    email: EmailStr
    username: str = _USERNAME_FIELD
    password: str = _PASSWORD_FIELD
    role: str = Field(default="care_worker", pattern="^(care_worker|manager)$")
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None


class UserUpdateByManager(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.]+$")
    role: str | None = Field(default=None, pattern="^(care_worker|manager)$")
    password: str | None = None
    name: str | None = None
    phone_number: str | None = None
    job_title: str | None = None
    bio: str | None = Field(default=None, max_length=1000)
    profile_photo_url: str | None = None


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