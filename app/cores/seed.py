import logging

from sqlalchemy.orm import Session

from app.cores.config import settings
from app.cores.database import engine
from app.cores.security import hash_password
from app.models.user import User

logger = logging.getLogger(__name__)


def seed_manager_account():
    with Session(engine) as db:
        existing_manager = db.query(User).filter(User.role == "manager").first()
        if existing_manager:
            logger.info("Manager account already exists — skipping seed")
            return

        existing_email = db.query(User).filter(User.email == settings.seed_manager_email).first()
        if existing_email:
            logger.info(f"Promoting existing user {settings.seed_manager_email} to manager")
            existing_email.role = "manager"  # pyrefly: ignore [bad-assignment]
            db.commit()
            return

        manager = User(
            email=settings.seed_manager_email,
            username=settings.seed_manager_username,
            password=hash_password(settings.seed_manager_password),
            role="manager",  # pyrefly: ignore [bad-assignment]
        )
        db.add(manager)
        db.commit()
        logger.info(f"Seeded manager account: {settings.seed_manager_email}")