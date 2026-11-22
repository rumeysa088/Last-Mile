from pydantic import BaseModel, Field


class ScamCheckRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    language: str | None = Field(default=None, max_length=10)


class ScamCheckResponse(BaseModel):
    result: str  # "suspicious" | "likely_legitimate" | "unknown"
    confidence: float
    explanation: str
    evidence: list[str] = Field(default_factory=list)
    safe_next_steps: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    model_version: str
    requires_human_review: bool


class VoiceSTTResponse(BaseModel):
    transcript: str
    language: str = "en"
    confidence: float
    needs_confirmation: bool = True
    model_version: str
