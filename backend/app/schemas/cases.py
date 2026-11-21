from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CaseCreate(BaseModel):
    title: str
    description: str | None = None
    family_id: UUID | None = None


class CaseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class CaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    family_id: UUID | None
    created_by: UUID
    assigned_to: UUID | None
    title: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
