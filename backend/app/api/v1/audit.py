from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import AuditLog, User
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get(
    "/logs",
    response_model=list[AuditLogResponse],
)
def list_audit_logs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Retrieve audit logs scoped to the officer's tenant."""
    query = db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id)

    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
