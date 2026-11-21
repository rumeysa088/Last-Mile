import importlib
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

SCAM_KEYWORDS = [
    "pin",
    "otp",
    "password",
    "bank account",
    "transfer money",
    "won",
    "prize",
    "lottery",
    "congratulations",
    "urgent payment",
    "click here to claim",
    "fee required",
    "bisp cash",
]


def classify_message_mock(message: str, language: str | None = None) -> dict[str, Any]:
    """Deterministic, transparent mock fallback for scam message classification."""
    lowered = message.lower()
    matched_evidence = [kw for kw in SCAM_KEYWORDS if kw in lowered]

    if matched_evidence:
        return {
            "result": "suspicious",
            "confidence": 0.88,
            "explanation": f"The message contains high-risk triggers commonly found in government impersonation scams: {', '.join(matched_evidence)}.",
            "evidence": matched_evidence,
            "sources": [],
            "model_version": "mock-rules-v1",
            "requires_human_review": False,
        }

    if len(message.strip()) < 10:
        return {
            "result": "unknown",
            "confidence": 0.40,
            "explanation": "Message is too short or ambiguous to evaluate reliably.",
            "evidence": [],
            "sources": [],
            "model_version": "mock-rules-v1",
            "requires_human_review": True,
        }

    return {
        "result": "likely_legitimate",
        "confidence": 0.82,
        "explanation": "No common scam indicators detected. Citizens should always verify announcements through official department portals.",
        "evidence": [],
        "sources": [],
        "model_version": "mock-rules-v1",
        "requires_human_review": False,
    }


def call_scam_classifier(message: str, language: str | None = None) -> dict[str, Any]:
    """
    Adapter invoking Member B's classifier module if available,
    falling back seamlessly to mock mode if absent or configured.
    """
    if settings.llm_provider != "mock":
        try:
            # Dynamically import Member B's module if implemented
            classifier_mod = importlib.import_module("app.services.ai.classifier")
            if hasattr(classifier_mod, "classify_message"):
                return classifier_mod.classify_message(message, language=language)
        except Exception as exc:
            logger.warning(
                f"Member B AI classifier unavailable ({exc}), falling back to mock mode."
            )

    return classify_message_mock(message, language=language)


def transcribe_voice_mock(audio_bytes: bytes, filename: str = "audio.wav") -> dict[str, Any]:
    """Deterministic mock for speech-to-text integration."""
    return {
        "transcript": "Citizen application assistance request: Please verify household status.",
        "language": "en",
        "confidence": 0.92,
        "needs_confirmation": True,
        "model_version": "mock-voice-v1",
    }


def call_voice_transcriber(audio_bytes: bytes, filename: str = "audio.wav") -> dict[str, Any]:
    """Adapter for Member B's speech-to-text service."""
    if settings.llm_provider != "mock":
        try:
            voice_mod = importlib.import_module("app.services.ai.voice")
            if hasattr(voice_mod, "transcribe_audio"):
                return voice_mod.transcribe_audio(audio_bytes, filename=filename)
        except Exception as exc:
            logger.warning(
                f"Member B voice module unavailable ({exc}), falling back to mock mode."
            )

    return transcribe_voice_mock(audio_bytes, filename=filename)
