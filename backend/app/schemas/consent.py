from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ConsentCreate(BaseModel):
    family_id: UUID
    subject_id: UUID | None = None
    recipient_id: UUID | None = None
    purpose: str | None = Field(default="case_support", max_length=100)
    scope: str = Field(default="read_write", min_length=1, max_length=100)


class ConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    family_id: UUID
    granted_by: UUID
    subject_id: UUID | None = None
    recipient_id: UUID | None = None
    purpose: str | None = None
    scope: str
    status: str
    granted_at: datetime
    withdrawn_at: datetime | None = None
