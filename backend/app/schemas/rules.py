from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Legacy compatibility schemas ---
class RuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)


class RuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str
    version: int
    is_active: bool
    created_by: UUID
    published_at: datetime | None = None
    created_at: datetime


# --- Modern Versioned RuleSet & RuleVersion schemas ---
class RuleSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class RuleSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID | None = None
    name: str
    description: str | None = None
    created_by: UUID
    created_at: datetime


class RuleVersionCreate(BaseModel):
    rules: dict = Field(default_factory=dict)


class RuleVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rule_set_id: UUID
    version: int
    rules: dict
    status: str
    created_by: UUID
    published_at: datetime | None = None
    created_at: datetime


class EvaluationRequest(BaseModel):
    rule_version_id: UUID | None = None
    rule_set_id: UUID | None = None
    case_id: UUID | None = None
    applicant_data: dict = Field(default_factory=dict)


class EvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rule_version_id: UUID
    case_id: UUID | None = None
    evaluated_by: UUID | None = None
    input_snapshot: dict
    result: dict
    missing_fields: list[str]
    outcome: str
    evaluated_at: datetime
