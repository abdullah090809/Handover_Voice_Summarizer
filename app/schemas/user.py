from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Issue #8 fix: bcrypt truncates/errors past 72 bytes, and an unconstrained
# `str` allowed empty/1-character passwords through validation.
_PASSWORD_FIELD = Field(min_length=8, max_length=72)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = _PASSWORD_FIELD


class UserOut(BaseModel):
    email: str
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    username: str
    password: str


class VerifyOTP(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class AssignCareHome(BaseModel):
    care_home_id: int


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
    """
    Issue #12 fix: a proper request-body model instead of a bare `email: str`
    function parameter, which FastAPI was treating as a query parameter on
    POST /resend-otp — leaking the address into URLs/access logs.
    """

    email: EmailStr
