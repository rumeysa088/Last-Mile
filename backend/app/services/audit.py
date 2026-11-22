from contextvars import ContextVar
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import AuditLog, User

_request_id: ContextVar[str | None] = ContextVar(
    "audit_request_id",
    default=None,
)

SENSITIVE_KEYS = {
    "password",
    "token",
    "secret",
    "authorization",
    "hashed_password",
    "access_token",
    "api_key",
}


def sanitize_details(data: dict) -> dict:
    """Recursively mask sensitive keys in audit detail payloads."""
    sanitized = {}
    for k, v in data.items():
        if any(sensitive in str(k).lower() for sensitive in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_details(v)
        elif isinstance(v, list):
            sanitized[k] = [
                sanitize_details(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            sanitized[k] = v
    return sanitized


def set_request_id(request_id: str):
    return _request_id.set(request_id)


def reset_request_id(token) -> None:
    _request_id.reset(token)


def log_action(
    db: Session,
    actor_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    details: dict | None = None,
    outcome: str = "success",
):
    """
    Create an audit event.

    Automatically records the actor's tenant and role,
    the current request ID, and a safe change summary.
    """
    actor = None

    if actor_id is not None:
        actor = (
            db.query(User)
            .filter(User.id == actor_id)
            .first()
        )

    raw_details = details or {}
    safe_details = sanitize_details(raw_details)

    change_summary = {
        "changed_fields": sorted(
            str(key) for key in raw_details.keys()
        )
    }

    audit_entry = AuditLog(
        actor_id=actor_id,
        tenant_id=actor.tenant_id if actor else None,
        actor_role=actor.role if actor else None,
        request_id=_request_id.get(),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        outcome=outcome,
        details=safe_details,
        change_summary=change_summary,
    )

    db.add(audit_entry)
    db.flush()

    return audit_entry
