
import pytest


def login(client, email):
    return client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": "TestPassword123!",
        },
    )


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_successful_login(client, test_users):
    response = login(client, "citizen@test.com")

    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


def test_invalid_password(client, test_users):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "citizen@test.com",
            "password": "WrongPassword123!",
        },
    )

    assert response.status_code == 401


def test_current_user_endpoint(client, test_users):
    response = login(client, "citizen@test.com")
    token = response.json()["access_token"]

    profile = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert profile.status_code == 200
    assert profile.json()["email"] == "citizen@test.com"
    assert profile.json()["role"] == "citizen"


def test_unauthenticated_access_denied(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("email", "expected_role"),
    [
        ("citizen@test.com", "citizen"),
        ("helper@test.com", "community_helper"),
        ("officer@test.com", "officer_admin"),
    ],
)
def test_authenticated_users_receive_correct_role(
    client,
    test_users,
    email,
    expected_role,
):
    response = login(client, email)

    assert response.status_code == 200

    token = response.json()["access_token"]

    profile = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert profile.status_code == 200
    assert profile.json()["role"] == expected_role


def test_cors_preflight(client):
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization,Content-Type",
    }
    response = client.options("/api/v1/auth/login", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_structured_error_response_422(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "invalid-email-format"},  # missing password
    )
    assert response.status_code == 422
    body = response.json()
    assert "detail" in body
    assert body.get("code") == "VALIDATION_ERROR"
    assert "request_id" in body


def test_inactive_user_cannot_login_or_authenticate(client, db_session, test_users):
    from app.models.models import User
    from app.core.security import hash_password, create_access_token

    inactive_user = User(
        tenant_id=test_users["tenant"].id,
        email="inactive@test.com",
        full_name="Inactive User",
        hashed_password=hash_password("TestPassword123!"),
        role="citizen",
        is_active=False,
    )
    db_session.add(inactive_user)
    db_session.commit()

    # Login attempt
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@test.com", "password": "TestPassword123!"},
    )
    assert login_resp.status_code == 401

    # Token-based attempt
    token = create_access_token(inactive_user.id, "citizen")
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 401


def test_tampered_or_invalid_jwt(client):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert response.status_code == 401


def test_expired_jwt(client, test_users):
    from datetime import datetime, timedelta, timezone
    import jwt
    from app.core.config import settings

    payload = {
        "sub": str(test_users["citizen"].id),
        "role": "citizen",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        "iat": datetime.now(timezone.utc) - timedelta(hours=2),
    }
    expired_token = jwt.encode(payload, settings.secret_key, algorithm="HS256")

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401


