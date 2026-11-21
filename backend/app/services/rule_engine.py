from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import RuleEvaluation, RuleSet, RuleVersion, User
from app.services.audit import log_action


def evaluate_criterion(
    field_name: str,
    operator: str,
    expected_value: Any,
    actual_value: Any,
) -> dict[str, Any]:
    """Evaluate a single criterion deterministically."""
    if actual_value is None:
        return {
            "field": field_name,
            "operator": operator,
            "expected": expected_value,
            "actual": None,
            "status": "unknown",
            "message": f"Required field '{field_name}' is missing or null",
        }

    try:
        if operator == "<=":
            passed = float(actual_value) <= float(expected_value)
        elif operator == "<":
            passed = float(actual_value) < float(expected_value)
        elif operator == ">=":
            passed = float(actual_value) >= float(expected_value)
        elif operator == ">":
            passed = float(actual_value) > float(expected_value)
        elif operator in ("==", "="):
            passed = str(actual_value).lower() == str(expected_value).lower()
        elif operator in ("!=", "<>"):
            passed = str(actual_value).lower() != str(expected_value).lower()
        elif operator == "in":
            passed = actual_value in expected_value
        else:
            return {
                "field": field_name,
                "operator": operator,
                "expected": expected_value,
                "actual": actual_value,
                "status": "error",
                "message": f"Unsupported operator '{operator}'",
            }

        return {
            "field": field_name,
            "operator": operator,
            "expected": expected_value,
            "actual": actual_value,
            "status": "pass" if passed else "fail",
            "message": "Criteria satisfied" if passed else "Criteria not satisfied",
        }
    except (ValueError, TypeError) as exc:
        return {
            "field": field_name,
            "operator": operator,
            "expected": expected_value,
            "actual": actual_value,
            "status": "error",
            "message": f"Evaluation error: {exc}",
        }


def evaluate_applicant_data(
    rule_version: RuleVersion,
    applicant_data: dict[str, Any],
) -> tuple[str, list[str], dict[str, Any]]:
    """
    Deterministically evaluate applicant data against a versioned rule set.

    Returns:
        outcome: 'eligible' | 'ineligible' | 'unknown'
        missing_fields: list of missing required fields
        result_details: breakdown of each evaluated criterion
    """
    rules_dict = rule_version.rules or {}
    criteria = rules_dict.get("criteria", [])

    criteria_results = []
    missing_fields = []
    has_failure = False
    has_unknown = False

    for criterion in criteria:
        field = criterion.get("field")
        op = criterion.get("operator", "==")
        expected = criterion.get("value")

        actual = applicant_data.get(field)

        eval_res = evaluate_criterion(field, op, expected, actual)
        criteria_results.append(eval_res)

        if eval_res["status"] == "unknown":
            has_unknown = True
            missing_fields.append(field)
        elif eval_res["status"] in ("fail", "error"):
            has_failure = True

    if has_failure:
        outcome = "ineligible"
    elif has_unknown:
        outcome = "unknown"
    else:
        outcome = "eligible"

    result_details = {
        "rule_set_id": str(rule_version.rule_set_id),
        "rule_version": rule_version.version,
        "criteria_evaluated": len(criteria),
        "breakdown": criteria_results,
    }

    return outcome, missing_fields, result_details


def run_deterministic_evaluation(
    db: Session,
    user: User,
    applicant_data: dict[str, Any],
    rule_version_id: UUID | None = None,
    rule_set_id: UUID | None = None,
    case_id: UUID | None = None,
) -> RuleEvaluation:
    """Execute evaluation and record immutable evaluation history."""
    target_version: RuleVersion | None = None

    if rule_version_id:
        target_version = db.query(RuleVersion).filter(
            RuleVersion.id == rule_version_id
        ).first()
        if not target_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rule version not found",
            )
    elif rule_set_id:
        target_version = db.query(RuleVersion).filter(
            RuleVersion.rule_set_id == rule_set_id,
            RuleVersion.status == "published",
        ).order_by(RuleVersion.version.desc()).first()

        if not target_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No published rule version found for this rule set",
            )
    else:
        # Default to latest published version across available sets
        target_version = db.query(RuleVersion).filter(
            RuleVersion.status == "published"
        ).order_by(RuleVersion.published_at.desc()).first()

        if not target_version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No published rule version available for evaluation",
            )

    outcome, missing_fields, result_details = evaluate_applicant_data(
        rule_version=target_version,
        applicant_data=applicant_data,
    )

    evaluation = RuleEvaluation(
        rule_version_id=target_version.id,
        case_id=case_id,
        evaluated_by=user.id,
        input_snapshot=applicant_data,
        result=result_details,
        missing_fields=missing_fields,
        outcome=outcome,
    )

    db.add(evaluation)
    db.flush()

    log_action(
        db=db,
        actor_id=user.id,
        action="rule.evaluated",
        entity_type="rule_evaluation",
        entity_id=evaluation.id,
        details={
            "rule_version_id": str(target_version.id),
            "case_id": str(case_id) if case_id else None,
            "outcome": outcome,
            "missing_fields": missing_fields,
        },
    )

    db.commit()
    db.refresh(evaluation)
    return evaluation
