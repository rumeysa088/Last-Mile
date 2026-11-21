

from uuid import UUID

from app.models.models import (
    Tenant,
    User,
    Family,
    Case,
    Consent,
    PlatformRule,
    AuditLog,
)
from app.models.family_assignment import FamilyAssignment


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": "TestPassword123!",
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def create_family_and_case(db_session, users):
    family = Family(
        tenant_id=users["tenant"].id,
        created_by=users["citizen"].id,
        name="Test Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=users["tenant"].id,
        family_id=family.id,
        created_by=users["citizen"].id,
        title="Test Case",
        description="Test case description",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    return family, case


def test_citizen_cannot_access_another_tenants_case(
    client,
    db_session,
    test_users,
):
    other_tenant = Tenant(name="Another Tenant")
    db_session.add(other_tenant)
    db_session.flush()

    other_citizen = User(
        tenant_id=other_tenant.id,
        email="other@test.com",
        full_name="Other Citizen",
        hashed_password="unused",
        role="citizen",
        is_active=True,
    )
    db_session.add(other_citizen)
    db_session.flush()

    other_case = Case(
        tenant_id=other_tenant.id,
        created_by=other_citizen.id,
        title="Private Case",
        description="Belongs to another tenant",
        status="submitted",
    )
    db_session.add(other_case)
    db_session.commit()

    token = get_token(client, "citizen@test.com")

    response = client.get(
        f"/api/v1/cases/{other_case.id}",
        headers=auth_header(token),
    )

    assert response.status_code == 404


def test_helper_cannot_access_family_without_active_consent(
    client,
    db_session,
    test_users,
):
    family, case = create_family_and_case(
        db_session,
        test_users,
    )

    assignment = FamilyAssignment(
        family_id=family.id,
        helper_id=test_users["helper"].id,
        assigned_by=test_users["citizen"].id,
        is_active=True,
    )
    db_session.add(assignment)
    db_session.commit()

    token = get_token(client, "helper@test.com")

    response = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(token),
    )

    assert response.status_code == 403


def test_helper_can_access_assigned_family_with_active_consent(
    client,
    db_session,
    test_users,
):
    family, case = create_family_and_case(
        db_session,
        test_users,
    )

    assignment = FamilyAssignment(
        family_id=family.id,
        helper_id=test_users["helper"].id,
        assigned_by=test_users["citizen"].id,
        is_active=True,
    )

    consent = Consent(
        family_id=family.id,
        granted_by=test_users["citizen"].id,
        scope="case_support",
        status="active",
    )

    db_session.add_all([assignment, consent])
    db_session.commit()

    token = get_token(client, "helper@test.com")

    response = client.get(
        f"/api/v1/cases/{case.id}",
        headers=auth_header(token),
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(case.id)


def test_officer_can_assign_case_to_helper(
    client,
    db_session,
    test_users,
):
    family, case = create_family_and_case(
        db_session,
        test_users,
    )

    consent = Consent(
        family_id=family.id,
        granted_by=test_users["citizen"].id,
        scope="case_support",
        status="active",
    )
    db_session.add(consent)
    db_session.commit()

    token = get_token(client, "officer@test.com")

    response = client.post(
        f"/api/v1/cases/{case.id}/assign",
        json={"helper_id": str(test_users["helper"].id)},
        headers=auth_header(token),
    )

    assert response.status_code == 200
    assert response.json()["assigned_to"] == str(
        test_users["helper"].id
    )


def test_officer_can_publish_versioned_rules(
    client,
    db_session,
    test_users,
):
    token = get_token(client, "officer@test.com")
    headers = auth_header(token)

    first = client.post(
        "/api/v1/rules/",
        json={
            "title": "Eligibility Policy",
            "description": "First policy version",
        },
        headers=headers,
    )

    assert first.status_code == 201
    first_rule = first.json()

    assert first_rule["version"] == 1
    assert first_rule["is_active"] is False

    publish_first = client.post(
        f"/api/v1/rules/{first_rule['id']}/publish",
        headers=headers,
    )

    assert publish_first.status_code == 200
    assert publish_first.json()["is_active"] is True

    second = client.post(
        "/api/v1/rules/",
        json={
            "title": "Eligibility Policy",
            "description": "Updated policy version",
        },
        headers=headers,
    )

    assert second.status_code == 201
    second_rule = second.json()

    assert second_rule["version"] == 2
    assert second_rule["is_active"] is False

    publish_second = client.post(
        f"/api/v1/rules/{second_rule['id']}/publish",
        headers=headers,
    )

    assert publish_second.status_code == 200
    assert publish_second.json()["is_active"] is True

    first_rule_db = db_session.get(
        PlatformRule,
        UUID(first_rule["id"]),
    )

    assert first_rule_db is not None

    db_session.refresh(first_rule_db)

    assert first_rule_db.is_active is False


def test_case_creation_generates_audit_log(
    client,
    db_session,
    test_users,
):
    token = get_token(client, "citizen@test.com")

    response = client.post(
        "/api/v1/cases/",
        json={
            "title": "Audit Test Case",
            "description": "Checking audit logging",
        },
        headers=auth_header(token),
    )

    assert response.status_code == 201

    case_id = response.json()["id"]

    audit_entry = db_session.query(AuditLog).filter(
        AuditLog.entity_id == UUID(case_id),
        AuditLog.action == "case.created",
    ).first()

    assert audit_entry is not None
    assert audit_entry.actor_id == test_users["citizen"].id
