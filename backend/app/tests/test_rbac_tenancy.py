from uuid import UUID

from app.models.models import Case, Family, Tenant, User
from app.core.security import hash_password


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_cross_tenant_family_access_denied(client, db_session, test_users):
    other_tenant = Tenant(name="Other Tenant")
    db_session.add(other_tenant)
    db_session.flush()

    other_citizen = User(
        tenant_id=other_tenant.id,
        email="other_citizen@test.com",
        full_name="Other Citizen",
        hashed_password=hash_password("TestPassword123!"),
        role="citizen",
        is_active=True,
    )
    db_session.add(other_citizen)
    db_session.flush()

    other_family = Family(
        tenant_id=other_tenant.id,
        created_by=other_citizen.id,
        name="Other Family",
    )
    db_session.add(other_family)
    db_session.commit()

    token = get_token(client, "citizen@test.com")
    resp = client.get(
        f"/api/v1/families/{other_family.id}",
        headers=auth_header(token),
    )
    assert resp.status_code == 404


def test_role_restricted_endpoints(client, test_users):
    citizen_token = get_token(client, "citizen@test.com")

    # Citizen cannot access officer review endpoint
    review_resp = client.post(
        f"/api/v1/cases/{test_users['citizen'].id}/review",
        json={"status": "approved", "reason": "Unauthorized review attempt"},
        headers=auth_header(citizen_token),
    )
    assert review_resp.status_code == 403

    # Citizen cannot access audit logs
    audit_resp = client.get(
        "/api/v1/audit/logs",
        headers=auth_header(citizen_token),
    )
    assert audit_resp.status_code == 403

    # Citizen cannot publish rules
    publish_resp = client.post(
        f"/api/v1/rules/{test_users['citizen'].id}/publish",
        headers=auth_header(citizen_token),
    )
    assert publish_resp.status_code == 403


def test_officer_can_view_all_tenant_cases_and_audit(client, db_session, test_users):
    family = Family(
        tenant_id=test_users["tenant"].id,
        created_by=test_users["citizen"].id,
        name="Citizen Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=test_users["tenant"].id,
        family_id=family.id,
        created_by=test_users["citizen"].id,
        title="Officer Visible Case",
        description="Visible to officer",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    officer_token = get_token(client, "officer@test.com")
    resp = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(officer_token),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Officer Visible Case"

    # Officer can access audit logs
    audit_resp = client.get(
        "/api/v1/audit/logs",
        headers=auth_header(officer_token),
    )
    assert audit_resp.status_code == 200
    assert isinstance(audit_resp.json(), list)
