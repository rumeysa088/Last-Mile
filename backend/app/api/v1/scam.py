from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.scam import ScamCheckRequest, ScamCheckResponse
from app.services.ai_adapter import call_scam_classifier
from app.services.audit import log_action

router = APIRouter(prefix="/scam", tags=["AI Integration"])


@router.post(
    "/check",
    response_model=ScamCheckResponse,
    status_code=status.HTTP_200_OK,
)
def check_scam_message(
    data: ScamCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate an incoming message for fraudulent or scam indicators.
    Invokes Member B's AI classifier with automatic fallback to mock mode.
    """
    result = call_scam_classifier(
        message=data.message,
        language=data.language,
    )

    log_action(
        db=db,
        actor_id=current_user.id,
        action="scam.checked",
        entity_type="scam_check",
        entity_id=None,
        details={
            "result": result["result"],
            "confidence": result["confidence"],
            "model_version": result["model_version"],
        },
        outcome="success",
    )
    db.commit()

    return result
