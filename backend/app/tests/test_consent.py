from uuid import UUID

from app.core.security import hash_password
from app.models.family_assignment import FamilyAssignment
from app.models.models import Case, Consent, Family, User


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def setup_family_and_case(db_session, users):
    family = Family(
        tenant_id=users["tenant"].id,
        created_by=users["citizen"].id,
        name="Consent Test Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=users["tenant"].id,
        family_id=family.id,
        created_by=users["citizen"].id,
        title="Consent Protected Case",
        description="Confidential case details",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    return family, case


def test_grant_and_withdraw_specific_consent(client, db_session, test_users):
    family, case = setup_family_and_case(db_session, test_users)

    # Assign helper to family
    assignment = FamilyAssignment(
        family_id=family.id,
        helper_id=test_users["helper"].id,
        assigned_by=test_users["citizen"].id,
        is_active=True,
    )
    db_session.add(assignment)
    db_session.commit()

    citizen_token = get_token(client, "citizen@test.com")
    helper_token = get_token(client, "helper@test.com")

    # Grant specific consent via canonical /api/v1/consents
    grant_resp = client.post(
        "/api/v1/consents/",
        json={
            "family_id": str(family.id),
            "recipient_id": str(test_users["helper"].id),
            "purpose": "case_support",
            "scope": "read_write",
        },
        headers=auth_header(citizen_token),
    )
    assert grant_resp.status_code == 201
    consent_id = grant_resp.json()["id"]

    # Helper can now access the case
    access_resp = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(helper_token),
    )
    assert access_resp.status_code == 200

    # Citizen withdraws this specific consent
    withdraw_resp = client.post(
        f"/api/v1/consents/{consent_id}/withdraw",
        headers=auth_header(citizen_token),
    )
    assert withdraw_resp.status_code == 200
    assert withdraw_resp.json()["status"] == "withdrawn"

    # Helper access is immediately blocked
    blocked_resp = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(helper_token),
    )
    assert blocked_resp.status_code == 403
    assert "Active consent is required" in blocked_resp.json()["detail"]


def test_direct_case_assignment_cannot_bypass_withdrawn_consent(client, db_session, test_users):
    """Verifies fix for SEC-01: direct assignment cannot bypass consent."""
    family, case = setup_family_and_case(db_session, test_users)

    # Directly assign case to helper
    case.assigned_to = test_users["helper"].id

    # Create active consent initially
    consent = Consent(
        family_id=family.id,
        granted_by=test_users["citizen"].id,
        recipient_id=test_users["helper"].id,
        purpose="case_support",
        scope="read_write",
        status="active",
    )
    db_session.add(consent)
    db_session.commit()

    helper_token = get_token(client, "helper@test.com")
    citizen_token = get_token(client, "citizen@test.com")

    # Helper sees the case in list_cases
    list_before = client.get(
        "/api/v1/cases/",
        headers=auth_header(helper_token),
    )
    assert list_before.status_code == 200
    case_ids = [c["id"] for c in list_before.json()]
    assert str(case.id) in case_ids

    # Citizen withdraws consent
    withdraw_resp = client.post(
        f"/api/v1/consents/{consent.id}/withdraw",
        headers=auth_header(citizen_token),
    )
    assert withdraw_resp.status_code == 200

    # Helper must NOT see the case in list_cases despite Case.assigned_to == helper.id
    list_after = client.get(
        "/api/v1/cases/",
        headers=auth_header(helper_token),
    )
    assert list_after.status_code == 200
    case_ids_after = [c["id"] for c in list_after.json()]
    assert str(case.id) not in case_ids_after

    # Direct detail access is also blocked
    detail_resp = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(helper_token),
    )
    assert detail_resp.status_code == 403


def test_unrelated_consent_remains_active_when_one_is_withdrawn(client, db_session, test_users):
    family, case = setup_family_and_case(db_session, test_users)

    # Create second helper in same tenant
    helper2 = User(
        tenant_id=test_users["tenant"].id,
        email="helper2@test.com",
        full_name="Helper Two",
        hashed_password=hash_password("TestPassword123!"),
        role="community_helper",
        is_active=True,
    )
    db_session.add(helper2)
    db_session.flush()

    # Assign both helpers to family
    db_session.add_all([
        FamilyAssignment(family_id=family.id, helper_id=test_users["helper"].id, assigned_by=test_users["citizen"].id, is_active=True),
        FamilyAssignment(family_id=family.id, helper_id=helper2.id, assigned_by=test_users["citizen"].id, is_active=True),
    ])
    db_session.commit()

    citizen_token = get_token(client, "citizen@test.com")
    helper1_token = get_token(client, "helper@test.com")
    helper2_token = get_token(client, "helper2@test.com")

    # Grant consent to Helper 1 and Helper 2 separately
    c1 = client.post(
        "/api/v1/consents/",
        json={"family_id": str(family.id), "recipient_id": str(test_users["helper"].id), "purpose": "docs", "scope": "write"},
        headers=auth_header(citizen_token),
    ).json()

    c2 = client.post(
        "/api/v1/consents/",
        json={"family_id": str(family.id), "recipient_id": str(helper2.id), "purpose": "reviews", "scope": "read"},
        headers=auth_header(citizen_token),
    ).json()

    # Withdraw only Helper 1's consent
    client.post(f"/api/v1/consents/{c1['id']}/withdraw", headers=auth_header(citizen_token))

    # Helper 1 is blocked
    assert client.get(f"/api/v1/cases/{case.id}", headers=auth_header(helper1_token)).status_code == 403

    # Helper 2 remains authorized
    assert client.get(f"/api/v1/cases/{case.id}", headers=auth_header(helper2_token)).status_code == 200
