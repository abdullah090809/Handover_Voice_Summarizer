from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.cores.config import settings

SQLALCHEMY_DATABASE_URL = (
    f"postgresql://{settings.database_username}:{settings.database_password}"
    f"@{settings.database_hostname}:{settings.database_port}/{settings.database_name}"
)

# Issue #21 fix:
# - `declarative_base` now imported from `sqlalchemy.orm` (the
#   `sqlalchemy.ext.declarative` path is deprecated).
# - `pool_pre_ping=True` transparently discards stale/dropped connections
#   (DB restart, failover, idle connection reaped by a firewall) instead of
#   surfacing them as a request-time OperationalError.
# - explicit pool sizing/recycle instead of the untuned default.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
