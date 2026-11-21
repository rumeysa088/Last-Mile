from uuid import UUID

from sqlalchemy.orm import Session

from app.models.models import AuditLog


def log_action(
    db: Session,
    actor_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    details: dict | None = None,
):
    audit_entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    )

    db.add(audit_entry)
    db.flush()

    return audit_entry