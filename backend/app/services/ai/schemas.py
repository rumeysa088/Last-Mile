"""Shared output shapes (the "contract") for every AI service.

Think of each schema as a printed form: the AI must fill every box,
in the right format, or Pydantic refuses it. That is how we stop
messy/malformed AI output from reaching the rest of the system.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

Verdict = Literal["suspicious", "likely_legitimate", "unknown"]


class Source(BaseModel):
    title: str
    identifier: str          # URL or document id
    chunk_id: str


class AIResult(BaseModel):
    """Classifier output. Same shape as the shared contract."""
    result: Verdict
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    evidence: List[str] = []
    safe_next_steps: List[str] = []
    sources: List[Source] = []
    model_version: str
    requires_human_review: bool


class RAGAnswer(BaseModel):
    answer: str
    abstained: bool
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    sources: List[Source] = []
    model_version: str
    requires_human_review: bool


class FieldResult(BaseModel):
    name: str
    value: Optional[str] = None
    status: Literal["ok", "missing", "uncertain"]


class OCRResult(BaseModel):
    fields: List[FieldResult] = []
    raw_text: str = ""
    quality: Literal["good", "low", "unreadable", "unknown"] = "unknown"
    warnings: List[str] = []
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    model_version: str
    requires_human_review: bool
    identity_verified: Literal[False] = False   # OCR NEVER verifies identity


class VoiceResult(BaseModel):
    transcript: str
    language: str
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    model_version: str
    needs_confirmation: Literal[True] = True    # user must always confirm
    offer_text_entry: bool = False
    requires_human_review: bool = False


class AnomalyFlag(BaseModel):
    kind: str
    record_ids: List[str]
    detail: str


class AnomalyResult(BaseModel):
    flags: List[AnomalyFlag]
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    model_version: str
    requires_human_review: bool
    changes_case_status: Literal[False] = False  # flags never change a case


class GuardrailDecision(BaseModel):
    action: Literal["auto_ok", "ask_more_proof", "escalate_to_human", "blocked"]
    reasons: List[str]
    confidence: float
    explanation: str
    model_version: str = "guardrails-v1"
    requires_human_review: bool
