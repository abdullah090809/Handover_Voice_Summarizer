import logging

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.cores.config import settings
from app.cores.database import engine
from app.cores.security import hash_password
from app.models.user import User

logger = logging.getLogger(__name__)

# Arbitrary fixed key for the Postgres advisory lock below. Any 64-bit int
# works as long as it's unique to this lock's purpose and stable across
# deploys/workers.
_SEED_LOCK_KEY = 725_001


def _assign_employee_id(db: Session, user: User) -> None:
    """Same MGR-/EMP- scheme used in auth.py's /verify and user.py's
    create_user() -- kept in one place so every code path that can create a
    User row (self-signup, manager-created, and this startup seed) actually
    runs it, instead of each one re-implementing (and potentially
    forgetting) the same three lines."""
    if not user.employee_id:
        prefix = "MGR" if user.role == "manager" else "EMP"
        user.employee_id = f"{prefix}-{user.id:04d}"
        db.commit()
        db.refresh(user)


def seed_manager_account():
    with Session(engine) as db:
        # Gunicorn runs multiple worker processes (see Dockerfile/compose.yaml,
        # --workers 4), and each one runs this function on its own startup.
        # Without serializing them, all workers can see "no manager yet" at
        # the same instant and race to INSERT one. Only one INSERT wins (the
        # unique email constraint), but Postgres burns an auto-increment id
        # for every attempted INSERT regardless of whether it's rolled back,
        # so losing attempts permanently skip ids. pg_advisory_lock makes the
        # whole check-then-insert atomic across workers so only one process
        # ever attempts the insert in the first place.
        db.execute(text("SELECT pg_advisory_lock(:key)"), {"key": _SEED_LOCK_KEY})
        try:
            existing_manager = db.query(User).filter(User.role == "manager").first()
            if existing_manager:
                logger.info("Manager account already exists — skipping seed")
                if not existing_manager.employee_id:
                    # Backfill for managers seeded before this fix existed.
                    _assign_employee_id(db, existing_manager)
                    logger.info(f"Backfilled employee_id for existing manager: {existing_manager.employee_id}")
                return

            existing_email = db.query(User).filter(User.email == settings.seed_manager_email).first()
            if existing_email:
                logger.info(f"Promoting existing user {settings.seed_manager_email} to manager")
                existing_email.role = "manager"  # pyrefly: ignore [bad-assignment]
                db.commit()
                _assign_employee_id(db, existing_email)
                return

            manager = User(
                email=settings.seed_manager_email,
                username=settings.seed_manager_username,
                password=hash_password(settings.seed_manager_password),
                role="manager",  # pyrefly: ignore [bad-assignment]
            )
            db.add(manager)
            db.commit()
            db.refresh(manager)
            _assign_employee_id(db, manager)
            logger.info(f"Seeded manager account: {settings.seed_manager_email} ({manager.employee_id})")
        except IntegrityError:
            # Kept as a safety net in case seeding ever runs outside this
            # advisory lock (e.g. a manual script), but under the lock this
            # branch should no longer be reachable from worker startup races.
            db.rollback()
            logger.info("Manager account seed lost race — skipping")
        finally:
            db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": _SEED_LOCK_KEY})
            db.commit()