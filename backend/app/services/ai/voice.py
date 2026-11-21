"""Speech-to-text adapter. Mock by default (STT_MODE=mock). Transcript must always be
confirmed by the user before submission."""
import os
from typing import Optional
from .schemas import VoiceResult

TESTED_LANGUAGES: list = []   # honestly list languages you actually tested with a real engine


def transcribe(audio_path: Optional[str] = None, language: str = "ur",
               mock_text: str = "") -> VoiceResult:
    mode = os.getenv("STT_MODE", "mock").lower()
    if mode == "mock":
        return VoiceResult(
            transcript=mock_text or "[mock transcript] please confirm or type your request",
            language=language, confidence=0.5,
            explanation="Mock speech-to-text. Please check the text, then confirm or edit it.",
            model_version="stt-mock-v1",
            offer_text_entry=language not in TESTED_LANGUAGES)
    # Real engine (e.g. Whisper) would go here. Until it is tested, be honest:
    return VoiceResult(
        transcript="", language=language, confidence=0.0,
        explanation=f"Reliable speech recognition for '{language}' is not available. Please type instead.",
        model_version="stt-unavailable", offer_text_entry=True, requires_human_review=False)
