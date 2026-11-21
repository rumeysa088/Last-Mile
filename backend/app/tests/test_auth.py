
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
