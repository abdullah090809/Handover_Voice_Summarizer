import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from app.models.shift import Shift
from app.cores.config import settings
from app.cores.database import Base, get_db
from app.cores.security import create_access_token, hash_password
from app.main import app
from app.models.care_home import CareHome
from app.models.resident import Resident
from app.models.shift import Shift
from app.models.user import User
from app.models.pending_user import PendingUser
from app.models.password_reset import PasswordReset
from app.models.handover_note import HandoverNote

SQLALCHEMY_TEST_DATABASE_URL = (
    f"postgresql://{settings.database_username}:{settings.database_password}"
    f"@{settings.database_hostname}:{settings.database_port}/{settings.test_database_name}"
)

engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def test_care_home(db_session):
    care_home = CareHome(name="Test Care Home", address="123 Test St")
    db_session.add(care_home)
    db_session.commit()
    db_session.refresh(care_home)
    return care_home

@pytest.fixture()
def test_resident(db_session, test_care_home):
    from app.models.resident import Resident

    resident = Resident(name="Jane Doe", care_home_id=test_care_home.id)
    db_session.add(resident)
    db_session.commit()
    db_session.refresh(resident)
    return resident


@pytest.fixture()
def test_user(db_session, test_care_home):
    user = User(
        email="worker@test.com",
        password=hash_password("password123"),
        role="care_worker",
        care_home_id=test_care_home.id,
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
def test_manager(db_session, test_care_home):
    manager = User(
        email="manager@test.com",
        password=hash_password("password123"),
        role="manager",
        care_home_id=test_care_home.id,
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