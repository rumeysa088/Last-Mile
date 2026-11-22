
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    case_id: UUID
    uploaded_by: UUID
    filename: str
    content_type: str | None
    created_at: datetime
    # Member B's OCR result for images, only on the upload response. Reads text only;
    # identity_verified is always False. None for PDFs or if OCR could not run.
    ocr: dict[str, Any] | None = None
