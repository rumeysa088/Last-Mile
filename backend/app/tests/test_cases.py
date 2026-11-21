from uuid import UUID

from app.models.family_assignment import FamilyAssignment
from app.models.models import Case, Consent, Family


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_citizen_case_lifecycle_and_pagination(client, db_session, test_users):
    citizen_token = get_token(client, "citizen@test.com")
    headers = auth_header(citizen_token)

    # 1. Create family
    fam_resp = client.post("/api/v1/families/", json={"name": "Paging Family"}, headers=headers)
    assert fam_resp.status_code == 201
    fam_id = fam_resp.json()["id"]

    # 2. Create multiple cases
    for i in range(3):
        client.post(
            "/api/v1/cases/",
            json={"title": f"Case Number {i+1}", "family_id": fam_id, "description": "Pagination test"},
            headers=headers,
        )

    # 3. List with limit=2
    list_p1 = client.get("/api/v1/cases/?limit=2&offset=0", headers=headers)
    assert list_p1.status_code == 200
    assert len(list_p1.json()) == 2

    # 4. List offset=2
    list_p2 = client.get("/api/v1/cases/?limit=2&offset=2", headers=headers)
    assert list_p2.status_code == 200
    assert len(list_p2.json()) == 1

    # 5. Patch case description
    case_to_patch = list_p1.json()[0]["id"]
    patch_resp = client.patch(
        f"/api/v1/cases/{case_to_patch}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "Updated Title"

    # 6. Status cannot be patched directly
    status_patch = client.patch(
        f"/api/v1/cases/{case_to_patch}",
        json={"status": "approved"},
        headers=headers,
    )
    assert status_patch.status_code == 403


def test_officer_review_state_transitions_and_reasons(client, db_session, test_users):
    family = Family(
        tenant_id=test_users["tenant"].id,
        created_by=test_users["citizen"].id,
        name="Review Test Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=test_users["tenant"].id,
        family_id=family.id,
        created_by=test_users["citizen"].id,
        title="Review State Machine Case",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    officer_token = get_token(client, "officer@test.com")
    headers = auth_header(officer_token)

    # 1. Invalid status string returns 422
    inv_stat = client.post(
        f"/api/v1/cases/{case.id}/review",
        json={"status": "arbitrary_unknown_status"},
        headers=headers,
    )
    assert inv_stat.status_code == 422
    assert "Invalid case status" in inv_stat.json()["detail"]

    # 2. Transition submitted -> under_review
    trans1 = client.post(
        f"/api/v1/cases/{case.id}/review",
        json={"status": "under_review"},
        headers=headers,
    )
    assert trans1.status_code == 200
    assert trans1.json()["status"] == "under_review"

    # 3. High-impact transition (approved) without reason rejected
    no_reason = client.post(
        f"/api/v1/cases/{case.id}/review",
        json={"status": "approved"},
        headers=headers,
    )
    assert no_reason.status_code == 422
    assert "documented reason is required" in no_reason.json()["detail"]

    # 4. High-impact transition with valid reason succeeds
    with_reason = client.post(
        f"/api/v1/cases/{case.id}/review",
        json={"status": "approved", "reason": "All documents verified and criteria met."},
        headers=headers,
    )
    assert with_reason.status_code == 200
    assert with_reason.json()["status"] == "approved"

    # 5. Invalid transition from approved -> submitted rejected
    inv_trans = client.post(
        f"/api/v1/cases/{case.id}/review",
        json={"status": "submitted"},
        headers=headers,
    )
    assert inv_trans.status_code == 422
    assert "Invalid status transition" in inv_trans.json()["detail"]


def test_helper_assisted_case_creation(client, db_session, test_users):
    family = Family(
        tenant_id=test_users["tenant"].id,
        created_by=test_users["citizen"].id,
        name="Assisted Family",
    )
    db_session.add(family)
    db_session.flush()

    helper_token = get_token(client, "helper@test.com")

    # Attempt to create case without assignment and consent -> 403
    unauth_resp = client.post(
        "/api/v1/cases/",
        json={"title": "Unauthorized Assisted Case", "family_id": str(family.id)},
        headers=auth_header(helper_token),
    )
    assert unauth_resp.status_code == 403

    # Grant assignment and consent
    db_session.add_all([
        FamilyAssignment(family_id=family.id, helper_id=test_users["helper"].id, assigned_by=test_users["citizen"].id, is_active=True),
        Consent(family_id=family.id, granted_by=test_users["citizen"].id, recipient_id=test_users["helper"].id, scope="write", status="active"),
    ])
    db_session.commit()

    # Now helper can create assisted case
    auth_resp = client.post(
        "/api/v1/cases/",
        json={"title": "Authorized Assisted Case", "family_id": str(family.id), "description": "Created on behalf of citizen"},
        headers=auth_header(helper_token),
    )
    assert auth_resp.status_code == 201
    assert auth_resp.json()["title"] == "Authorized Assisted Case"
