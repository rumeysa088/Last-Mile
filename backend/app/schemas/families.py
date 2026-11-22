
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FamilyCreate(BaseModel):
    name: str


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    name: str
    created_at: datetime


class ConsentCreate(BaseModel):
    scope: str


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    family_id: UUID
    granted_by: UUID
    scope: str
    status: str
    granted_at: datetime
    withdrawn_at: datetime | None
