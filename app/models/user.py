from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, nullable=False)
    email = Column(String, nullable=False, unique=True)
    username = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, server_default="care_worker")
    previous_role = Column(String, nullable=True)
    name = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    profile_photo_url = Column(String, nullable=True)

    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )