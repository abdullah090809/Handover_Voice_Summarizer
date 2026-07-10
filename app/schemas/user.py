from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str

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
    otp_code: str

class AssignCareHome(BaseModel):
    care_home_id: int

class ForgotPassword(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str