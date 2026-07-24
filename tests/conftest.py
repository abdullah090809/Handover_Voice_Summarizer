from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.cores.celery_app import celery_app
from app.cores.config import settings
from app.cores.database import Base, get_db
from app.cores.limiter import limiter
from app.cores.security import create_access_token, hash_password
from app.main import app
from app.models.handover_note import HandoverNote  # noqa: F401 (ensures table is registered)
from app.models.notification import Notification  # noqa: F401
from app.models.password_reset import PasswordReset  # noqa: F401
from app.models.pending_user import PendingUser  # noqa: F401
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User

SQLALCHEMY_TEST_DATABASE_URL = (
    f"postgresql://{settings.database_username}:{settings.database_password}"
    f"@{settings.database_hostname}:{settings.database_port}/{settings.test_database_name}"
)

engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """
    slowapi's default MemoryStorage is a module-level singleton shared by
    every request the app handles, in tests or otherwise. Without resetting
    it, hit counts accumulate across tests (and across test files, since
    the whole suite runs in one process), so a test that runs later can
    get a 429 on its very first call to a rate-limited endpoint
    (/register, /login, /forgot-password, /resend-otp, /reset-password,
    /verify) purely because of unrelated earlier tests.
    """
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture(autouse=True)
def _patch_background_task_session(monkeypatch, db_session):
    """
    process_handover_note() (now a Celery task in app.tasks) calls
    SessionLocal() directly (not via DI), so without this it writes to the
    real app database instead of the test database, and test assertions
    never see its writes.
    """
    monkeypatch.setattr("app.tasks.SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.routers.websocket.SessionLocal", TestingSessionLocal)


@pytest.fixture(autouse=True)
def _run_celery_tasks_eagerly():
    """
    /handover/transcribe now hands off processing to Celery via
    process_handover_note.delay(), which normally just publishes a message
    to the Redis broker for a separate worker process to pick up. There's
    no worker running in tests, so switch Celery into "eager" mode: .delay()
    executes the task function synchronously, in-process, without touching
    the broker at all. This restores the old assumption that handover
    processing has finished by the time a test's request call returns.
    """
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = False
    yield


@pytest.fixture()
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session, monkeypatch):
    def override_get_db():
        db_session.expire_all()  # avoid stale identity-map reads across requests
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    # seed_manager_account() runs on every app startup (see app.main's
    # lifespan) and — unlike everything else — talks to app.cores.database's
    # real engine directly instead of going through the overridden get_db
    # dependency, so it isn't confined to the isolated per-test database
    # above. Left alone, it inserts an extra "manager" row before every
    # test, which then shows up in any endpoint that queries
    # User.role == "manager" (e.g. urgent-handover email fan-out) and
    # throws off exact call-count assertions. It only exists to bootstrap
    # a real deployment, so it's a no-op for tests.
    monkeypatch.setattr("app.main.seed_manager_account", lambda: None)

    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def test_resident(db_session):
    resident = Resident(name="Jane Doe")
    db_session.add(resident)
    db_session.commit()
    db_session.refresh(resident)
    return resident


@pytest.fixture()
def test_user(db_session):
    user = User(
        email="worker@test.com",
        username="worker1",
        password=hash_password("password123"),
        role="care_worker",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def test_shift(db_session, test_user):
    shift = Shift(
        worker_id=test_user.id,
        start_time=datetime.now(timezone.utc),
    )
    db_session.add(shift)
    db_session.commit()
    db_session.refresh(shift)
    return shift


@pytest.fixture()
def test_manager(db_session):
    manager = User(
        email="manager@test.com",
        username="manager1",
        password=hash_password("password123"),
        role="manager",
    )
    db_session.add(manager)
    db_session.commit()
    db_session.refresh(manager)
    return manager


@pytest.fixture()
def worker_token(test_user):
    return create_access_token(data={"user_id": str(test_user.id)})


@pytest.fixture()
def manager_token(test_manager):
    return create_access_token(data={"user_id": str(test_manager.id)})


@pytest.fixture()
def worker_auth_headers(worker_token):
    return {"Authorization": f"Bearer {worker_token}"}


@pytest.fixture()
def manager_auth_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


def make_worker(db_session, email="otherworker@test.com", username=None):
    """Helper for tests that need a second, independent care worker."""
    if username is None:
        # Derive a unique, pattern-valid username from the email's local part.
        username = email.split("@", 1)[0].replace(".", "_")
    worker = User(
        email=email,
        username=username,
        password=hash_password("password123"),
        role="care_worker",
    )
    db_session.add(worker)
    db_session.commit()
    db_session.refresh(worker)
    return worker


def auth_headers_for(user):
    token = create_access_token(data={"user_id": str(user.id)})
    return {"Authorization": f"Bearer {token}"}