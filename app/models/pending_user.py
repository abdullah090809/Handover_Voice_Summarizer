from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class PendingUser(Base):
    __tablename__ = "pending_users"

    id = Column(Integer, primary_key=True, nullable=False)
    email = Column(String, nullable=False, unique=True)
    username = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, server_default="care_worker")

    name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    job_title = Column(String, nullable=True)

    otp_code = Column(String, nullable=False)
    otp_expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    otp_request_count = Column(Integer, nullable=False, server_default="1")
    otp_window_start = Column(TIMESTAMP(timezone=True), nullable=False, server_default=text("now()"))
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )