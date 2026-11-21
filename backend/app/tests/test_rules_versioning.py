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
