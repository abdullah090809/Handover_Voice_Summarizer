from sqlalchemy import Column, Integer, String

from app.cores.database import Base


class CareHome(Base):
    __tablename__ = "care_homes"

    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)