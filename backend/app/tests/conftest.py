
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.core.security import hash_password
from app.models import models
from app.models.family_assignment import FamilyAssignment


TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def test_users(db_session):
    from app.models.models import Tenant, User

    tenant = Tenant(name="Test Tenant")
    db_session.add(tenant)
    db_session.flush()

    citizen = User(
        tenant_id=tenant.id,
        email="citizen@test.com",
        full_name="Test Citizen",
        hashed_password=hash_password("TestPassword123!"),
        role="citizen",
        is_active=True,
    )

    officer = User(
        tenant_id=tenant.id,
        email="officer@test.com",
        full_name="Test Officer",
        hashed_password=hash_password("TestPassword123!"),
        role="officer_admin",
        is_active=True,
    )

    helper = User(
        tenant_id=tenant.id,
        email="helper@test.com",
        full_name="Test Helper",
        hashed_password=hash_password("TestPassword123!"),
        role="community_helper",
        is_active=True,
    )

    db_session.add_all([citizen, officer, helper])
    db_session.commit()

    return {
        "tenant": tenant,
        "citizen": citizen,
        "officer": officer,
        "helper": helper,
    }
