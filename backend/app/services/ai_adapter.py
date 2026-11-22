import importlib
import logging
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# Same safe next steps as Member B's classifier (app/services/ai/classifier.py NEXT_STEPS)
SAFE_NEXT_STEPS = {
    "suspicious": [
        "Do not click links or share PIN/OTP/CNIC.",
        "Do not send any money.",
        "Report the number and delete the message.",
        "Check using the official website or helpline.",
    ],
    "likely_legitimate": [
        "Still verify through the official website or helpline before acting.",
        "Never share your PIN or OTP.",
    ],
    "unknown": [
        "Do not act on this message yet.",
        "A person will review it; or check with the official helpline.",
    ],
}

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
            "safe_next_steps": SAFE_NEXT_STEPS["suspicious"],
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
            "safe_next_steps": SAFE_NEXT_STEPS["unknown"],
            "sources": [],
            "model_version": "mock-rules-v1",
            "requires_human_review": True,
        }

    return {
        "result": "likely_legitimate",
        "confidence": 0.82,
        "explanation": "No common scam indicators detected. Citizens should always verify announcements through official department portals.",
        "evidence": [],
        "safe_next_steps": SAFE_NEXT_STEPS["likely_legitimate"],
        "sources": [],
        "model_version": "mock-rules-v1",
        "requires_human_review": False,
    }


def _source_text(src: Any) -> str:
    if isinstance(src, dict):
        return f"{src.get('title', '')} ({src.get('identifier', '')}, {src.get('chunk_id', '')})"
    return str(src)


def call_scam_classifier(message: str, language: str | None = None) -> dict[str, Any]:
    """
    Adapter invoking Member B's classifier module if available,
    falling back seamlessly to mock mode if absent or configured.
    """
    # Always use Member B's classifier: it has its own offline mock mode (LLM_PROVIDER=mock)
    # and falls back to its evidence-based rules if the LLM fails. It returns a Pydantic
    # AIResult, so convert it to a dict before the route reads result["result"].
    try:
        classifier_mod = importlib.import_module("app.services.ai.classifier")
        result = classifier_mod.classify_message(message, language=language).model_dump()
        result["sources"] = [_source_text(s) for s in result.get("sources", [])]
        result.setdefault("safe_next_steps", SAFE_NEXT_STEPS.get(result["result"], SAFE_NEXT_STEPS["unknown"]))
        return result
    except Exception as exc:
        logger.warning(f"Member B AI classifier unavailable ({exc}), using keyword fallback.")

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
