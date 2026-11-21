"""Scam-message classifier.

Flow:  text -> LLM (or mock) -> validate -> cross-check with rules -> AIResult
Any failure -> fall back to rules. Disagreement -> "unknown" + human review.
Confidence comes from rule evidence, NOT from the model's own claim.
"""
import json
from typing import Optional

from pydantic import ValidationError

from .heuristics import heuristic_classify
from .llm_client import LLMClient, LLMError
from .schemas import AIResult

REVIEW_THRESHOLD = 0.60   # below this -> a human must look (see docs/DECISIONS.md)

NEXT_STEPS = {
    "suspicious": ["Do not click links or share PIN/OTP/CNIC.",
                   "Do not send any money.",
                   "Report the number and delete the message.",
                   "Check using the official website or helpline."],
    "likely_legitimate": ["Still verify through the official website or helpline before acting.",
                          "Never share your PIN or OTP."],
    "unknown": ["Do not act on this message yet.",
                "A person will review it; or check with the official helpline."],
}


def _build(result, conf, expl, evidence, version, extra_review=False) -> AIResult:
    review = extra_review or result == "unknown" or conf < REVIEW_THRESHOLD
    return AIResult(result=result, confidence=conf, explanation=expl, evidence=evidence,
                    safe_next_steps=NEXT_STEPS[result], model_version=version,
                    requires_human_review=review)


def classify_message(text: Optional[str], language: Optional[str] = None,
                     client: Optional[LLMClient] = None) -> AIResult:
    client = client or LLMClient()
    if not text or not text.strip():
        return _build("unknown", 0.0, "The message is empty, so nothing can be judged.",
                      [], client.model_version, extra_review=True)

    rules = heuristic_classify(text)          # our trusted evidence-based baseline
    try:
        raw = client.classify_json(text, language)
        data = json.loads(raw)
        llm_result = data["result"]
        if llm_result not in ("suspicious", "likely_legitimate", "unknown"):
            raise ValueError("bad label")
        expl = str(data.get("explanation") or rules["explanation"])
        evidence = [str(e) for e in (data.get("evidence") or rules["evidence"])]
    except LLMError:
        return _build(rules["result"], rules["confidence"],
                      rules["explanation"] + " (AI service unavailable; used basic rules.)",
                      rules["evidence"], "rules-fallback-v1")
    except (json.JSONDecodeError, KeyError, ValueError, TypeError, ValidationError):
        return _build(rules["result"], rules["confidence"],
                      rules["explanation"] + " (AI reply was unreadable; used basic rules.)",
                      rules["evidence"], "rules-fallback-v1")

    if llm_result != rules["result"]:
        # two judges disagree -> say "I am not sure"
        return _build("unknown", 0.4,
                      "The AI and the safety rules disagree, so a person should check.",
                      evidence, client.model_version, extra_review=True)
    return _build(rules["result"], rules["confidence"], expl, evidence, client.model_version)
