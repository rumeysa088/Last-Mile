from uuid import UUID

from app.models.models import RuleEvaluation, RuleVersion


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


SAMPLE_CRITERIA = {
    "criteria": [
        {
            "field": "monthly_income",
            "operator": "<=",
            "value": 50000,
            "description": "Income threshold",
        },
        {
            "field": "household_size",
            "operator": ">=",
            "value": 3,
            "description": "Minimum household size",
        },
    ]
}


def test_ruleset_and_version_lifecycle(client, test_users):
    token = get_token(client, "officer@test.com")
    headers = auth_header(token)

    # 1. Create rule set
    set_resp = client.post(
        "/api/v1/rules/sets",
        json={"name": "Kafalat Support Criteria", "description": "Cash assistance eligibility"},
        headers=headers,
    )
    assert set_resp.status_code == 201
    set_id = set_resp.json()["id"]

    # 2. Create draft version 1
    v1_resp = client.post(
        f"/api/v1/rules/sets/{set_id}/versions",
        json={"rules": SAMPLE_CRITERIA},
        headers=headers,
    )
    assert v1_resp.status_code == 201
    v1 = v1_resp.json()
    assert v1["version"] == 1
    assert v1["status"] == "draft"

    # 3. Publish version 1
    pub1_resp = client.post(
        f"/api/v1/rules/versions/{v1['id']}/publish",
        headers=headers,
    )
    assert pub1_resp.status_code == 200
    assert pub1_resp.json()["status"] == "published"

    # 4. Immutability: publishing again conflicts
    repub_resp = client.post(
        f"/api/v1/rules/versions/{v1['id']}/publish",
        headers=headers,
    )
    assert repub_resp.status_code == 409

    # 5. Create draft version 2
    v2_resp = client.post(
        f"/api/v1/rules/sets/{set_id}/versions",
        json={"rules": {"criteria": [{"field": "monthly_income", "operator": "<=", "value": 60000}]}},
        headers=headers,
    )
    assert v2_resp.status_code == 201
    assert v2_resp.json()["version"] == 2


def test_deterministic_evaluation_engine_and_unknown_handling(client, db_session, test_users):
    token = get_token(client, "officer@test.com")
    headers = auth_header(token)

    # Create & publish rule set
    set_id = client.post(
        "/api/v1/rules/sets",
        json={"name": "Income Eligibility", "description": "Deterministic tests"},
        headers=headers,
    ).json()["id"]

    v1_id = client.post(
        f"/api/v1/rules/sets/{set_id}/versions",
        json={"rules": SAMPLE_CRITERIA},
        headers=headers,
    ).json()["id"]

    client.post(f"/api/v1/rules/versions/{v1_id}/publish", headers=headers)

    # Scenario A: All criteria met -> eligible
    resp_a = client.post(
        "/api/v1/rules/evaluate",
        json={
            "rule_version_id": v1_id,
            "applicant_data": {"monthly_income": 35000, "household_size": 4},
        },
        headers=headers,
    )
    assert resp_a.status_code == 200
    assert resp_a.json()["outcome"] == "eligible"
    assert resp_a.json()["missing_fields"] == []

    # Scenario B: Condition failed -> ineligible
    resp_b = client.post(
        "/api/v1/rules/evaluate",
        json={
            "rule_version_id": v1_id,
            "applicant_data": {"monthly_income": 75000, "household_size": 4},
        },
        headers=headers,
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["outcome"] == "ineligible"

    # Scenario C: Field missing -> unknown (NOT silently failed!)
    resp_c = client.post(
        "/api/v1/rules/evaluate",
        json={
            "rule_version_id": v1_id,
            "applicant_data": {"monthly_income": 35000},  # household_size omitted
        },
        headers=headers,
    )
    assert resp_c.status_code == 200
    assert resp_c.json()["outcome"] == "unknown"
    assert resp_c.json()["missing_fields"] == ["household_size"]

    # Verify historical retention in DB
    eval_id = resp_a.json()["id"]
    eval_entry = db_session.get(RuleEvaluation, UUID(eval_id))
    assert eval_entry is not None
    assert eval_entry.rule_version_id == UUID(v1_id)
    assert eval_entry.input_snapshot["monthly_income"] == 35000


def test_rule_version_publishing_cross_tenant_isolation(client, db_session, test_users):
    """Verifies that an officer from Tenant B cannot publish Tenant A's rule versions."""
    from app.models.models import Tenant, User
    from app.core.security import hash_password

    # Create Tenant 2 and Officer 2
    tenant2 = Tenant(name="Second Territory Division")
    db_session.add(tenant2)
    db_session.flush()

    officer2 = User(
        tenant_id=tenant2.id,
        email="officer2@test.com",
        full_name="Second Officer",
        hashed_password=hash_password("TestPassword123!"),
        role="officer_admin",
        is_active=True,
    )
    db_session.add(officer2)
    db_session.commit()

    officer1_token = get_token(client, "officer@test.com")
    officer2_token = get_token(client, "officer2@test.com")

    # Officer 1 creates a private rule set in Tenant 1
    t1_set_resp = client.post(
        "/api/v1/rules/sets",
        json={"name": "Tenant 1 Exclusive Scheme", "description": "Confidential rule"},
        headers=auth_header(officer1_token),
    )
    assert t1_set_resp.status_code == 201
    set1_id = t1_set_resp.json()["id"]

    # Officer 1 creates draft version 1
    v1_resp = client.post(
        f"/api/v1/rules/sets/{set1_id}/versions",
        json={"rules": SAMPLE_CRITERIA},
        headers=auth_header(officer1_token),
    )
    assert v1_resp.status_code == 201
    v1_id = v1_resp.json()["id"]

    # Officer 2 attempts to publish Tenant 1's rule version -> 403 Forbidden
    cross_pub_resp = client.post(
        f"/api/v1/rules/versions/{v1_id}/publish",
        headers=auth_header(officer2_token),
    )
    assert cross_pub_resp.status_code == 403
    assert "another tenant" in cross_pub_resp.json()["detail"]
    assert "error" in cross_pub_resp.json()

    # Verify version 1 is STILL draft (failed cross-tenant call did not mutate records)
    v1_check = db_session.get(RuleVersion, UUID(v1_id))
    assert v1_check.status == "draft"

    # Officer 1 can successfully publish version 1
    pub1_resp = client.post(
        f"/api/v1/rules/versions/{v1_id}/publish",
        headers=auth_header(officer1_token),
    )
    assert pub1_resp.status_code == 200
    assert pub1_resp.json()["status"] == "published"


def test_historical_rule_evaluation_tenant_isolation(client, db_session, test_users):
    """Verifies that rule evaluations cannot be accessed across tenants or by unauthorized users."""
    from app.models.models import Case, Family, Tenant, User
    from app.core.security import hash_password

    # Setup case in Tenant 1
    family = Family(
        tenant_id=test_users["tenant"].id,
        created_by=test_users["citizen"].id,
        name="Evaluation Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=test_users["tenant"].id,
        family_id=family.id,
        created_by=test_users["citizen"].id,
        title="Evaluated Case",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    # Create Tenant 2 and citizen/officer in Tenant 2
    tenant2 = Tenant(name="Other Tenant")
    db_session.add(tenant2)
    db_session.flush()

    other_officer = User(
        tenant_id=tenant2.id,
        email="other_officer@test.com",
        full_name="Other Officer",
        hashed_password=hash_password("TestPassword123!"),
        role="officer_admin",
        is_active=True,
    )
    db_session.add(other_officer)
    db_session.commit()

    officer1_token = get_token(client, "officer@test.com")
    officer2_token = get_token(client, "other_officer@test.com")
    citizen1_token = get_token(client, "citizen@test.com")

    # Officer 1 creates and publishes rule set
    set_id = client.post(
        "/api/v1/rules/sets",
        json={"name": "Eval Isolation RuleSet"},
        headers=auth_header(officer1_token),
    ).json()["id"]

    v1_id = client.post(
        f"/api/v1/rules/sets/{set_id}/versions",
        json={"rules": SAMPLE_CRITERIA},
        headers=auth_header(officer1_token),
    ).json()["id"]

    client.post(f"/api/v1/rules/versions/{v1_id}/publish", headers=auth_header(officer1_token))

    # Evaluate case in Tenant 1
    eval_resp = client.post(
        "/api/v1/rules/evaluate",
        json={
            "rule_version_id": v1_id,
            "case_id": str(case.id),
            "applicant_data": {"monthly_income": 25000, "household_size": 3},
        },
        headers=auth_header(officer1_token),
    )
    assert eval_resp.status_code == 200
    eval_id = eval_resp.json()["id"]

    # 1. Officer 1 can retrieve the evaluation record
    get_t1 = client.get(
        f"/api/v1/rules/evaluations/{eval_id}",
        headers=auth_header(officer1_token),
    )
    assert get_t1.status_code == 200
    assert get_t1.json()["input_snapshot"]["monthly_income"] == 25000

    # 2. Citizen 1 (case owner) can retrieve the evaluation record
    get_citizen = client.get(
        f"/api/v1/rules/evaluations/{eval_id}",
        headers=auth_header(citizen1_token),
    )
    assert get_citizen.status_code == 200

    # 3. Officer 2 from Tenant 2 CANNOT access Tenant 1's evaluation (404 Not Found non-disclosing)
    get_t2 = client.get(
        f"/api/v1/rules/evaluations/{eval_id}",
        headers=auth_header(officer2_token),
    )
    assert get_t2.status_code == 404

    # 4. Fabricated UUID returns 404
    from uuid import uuid4
    assert client.get(f"/api/v1/rules/evaluations/{uuid4()}", headers=auth_header(officer1_token)).status_code == 404
