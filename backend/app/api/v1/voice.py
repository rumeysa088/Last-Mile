from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.schemas.scam import VoiceSTTResponse
from app.services.ai_adapter import call_voice_transcriber
from app.services.audit import log_action

router = APIRouter(prefix="/voice", tags=["AI Integration"])


@router.post(
    "/stt",
    response_model=VoiceSTTResponse,
    status_code=status.HTTP_200_OK,
)
async def speech_to_text(
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Transcribe speech audio for accessible citizen application entry.
    Requires user confirmation before any form submission.
    """
    content = await audio.read(10 * 1024 * 1024)  # 10 MB limit
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty",
        )

    result = call_voice_transcriber(
        audio_bytes=content,
        filename=audio.filename or "audio.wav",
    )

    log_action(
        db=db,
        actor_id=current_user.id,
        action="voice.transcribed",
        entity_type="voice_stt",
        entity_id=None,
        details={
            "filename": audio.filename,
            "confidence": result["confidence"],
            "model_version": result["model_version"],
        },
        outcome="success",
    )
    db.commit()

    return result
