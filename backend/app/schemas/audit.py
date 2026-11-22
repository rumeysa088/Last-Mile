from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None = None
    actor_id: UUID | None = None
    actor_role: str | None = None
    request_id: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None = None
    outcome: str
    details: dict | None = None
    change_summary: dict | None = None
    created_at: datetime
