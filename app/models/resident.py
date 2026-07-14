from sqlalchemy import Column, ForeignKey, Integer, String, TIMESTAMP

from app.cores.database import Base


class Resident(Base):
    __tablename__ = "residents"
    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default="active")
    discharged_at = Column(TIMESTAMP(timezone=True), nullable=True)
