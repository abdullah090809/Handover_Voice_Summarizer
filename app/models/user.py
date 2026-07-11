from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import TIMESTAMP

from app.cores.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, server_default="care_worker")
    # Issue #10 fix: index the FK — Postgres does not auto-index FK columns,
    # and this column is filtered on in residents/handover tenant-scoping.
    care_home_id = Column(
        Integer,
        ForeignKey("care_homes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
