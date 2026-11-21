"""Escalation + refusal policy.

Numbers (see docs/DECISIONS.md): wrong approval costs ~10x a slow review,
so the system acts alone only if P(wrong) < 1/10 -> confidence >= 0.90.
"""
import re
from typing import List
from .schemas import GuardrailDecision

AUTO_THRESHOLD = 0.90
HUMAN_THRESHOLD = 0.60


def decide(confidence: float, label: str = "", high_impact: bool = False,
           quality_ok: bool = True, conflicting: bool = False) -> GuardrailDecision:
    reasons: List[str] = []
    if conflicting:
        reasons.append("signals conflict")
    if not quality_ok:
        reasons.append("input quality is low")
    if label == "unknown":
        reasons.append("system is not sure")
    if confidence < HUMAN_THRESHOLD:
        reasons.append(f"confidence {confidence:.2f} is below {HUMAN_THRESHOLD}")
    if high_impact:
        reasons.append("high-impact action needs human approval")
    if reasons:
        action = "escalate_to_human"
    elif confidence < AUTO_THRESHOLD:
        action, reasons = "ask_more_proof", [f"confidence {confidence:.2f} is below {AUTO_THRESHOLD}"]
    else:
        action, reasons = "auto_ok", ["confidence is high and no risk flags"]
    return GuardrailDecision(
        action=action, reasons=reasons, confidence=confidence,
        explanation="; ".join(reasons),
        requires_human_review=action == "escalate_to_human")


_PHONE = re.compile(r"\+?\d[\d\s-]{8,}\d")
_PAY = re.compile(r"(send|transfer|deposit)\s.{0,40}(rs\.?|pkr|account|jazzcash|easypaisa)", re.I)


def check_answer_text(text: str, allowed_numbers: List[str] = ()) -> GuardrailDecision:
    """Block AI text that invents phone numbers or payment instructions."""
    problems = []
    for m in _PHONE.findall(text or ""):
        if m.strip() not in allowed_numbers:
            problems.append("contains a phone number not from a trusted source")
    if _PAY.search(text or ""):
        problems.append("contains payment instructions")
    if problems:
        return GuardrailDecision(action="blocked", reasons=problems, confidence=1.0,
                                 explanation="; ".join(problems), requires_human_review=True)
    return GuardrailDecision(action="auto_ok", reasons=["no unsafe content found"],
                             confidence=1.0, explanation="No unsafe content found.",
                             requires_human_review=False)
