from sqlalchemy import Column, ForeignKey, Integer, String

from app.cores.database import Base


class Resident(Base):
    __tablename__ = "residents"

    id = Column(Integer, primary_key=True, nullable=False)
    name = Column(String, nullable=False)
    care_home_id = Column(
        Integer, ForeignKey("care_homes.id", ondelete="CASCADE"), nullable=False
    )