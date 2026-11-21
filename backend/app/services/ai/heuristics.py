"""Transparent scam-signal rules (English + a little Urdu / Roman Urdu).

Each signal has a WEIGHT. Total score -> verdict -> confidence.
Why rules? You can point at the exact words that triggered the verdict,
which makes explanations and audits easy.
"""
import re

SIGNALS = [
    ("requests sensitive credential (PIN/OTP/password/CNIC)", 3,
     [r"\bpin\b", r"\botp\b", r"password", r"\bcvv\b", r"شناختی", r"پن\b",
      r"(send|share|reply|give).{0,25}\bcnic\b"]),
    ("asks for a fee or money transfer", 3,
     [r"processing fee", r"(send|pay|transfer|deposit).{0,30}(rs\.?|pkr|fee|charges|amount)",
      r"(jazzcash|easypaisa).{0,25}(send|transfer|pay)"]),
    ("uses a shortened link", 2,
     [r"bit\.ly", r"tinyurl", r"cutt\.ly", r"rb\.gy", r"\bt\.co/"]),
    ("contains a link", 1, [r"https?://", r"www\."]),
    ("creates urgency or threat", 1,
     [r"\burgent", r"immediately", r"within \d+ (hours|minutes|hrs)", r"\bfori\b",
      r"foran", r"jaldi", r"فوری", r"expire", r"blocked", r"suspended"]),
    ("promises relief money or a prize", 1,
     [r"relief (payment|fund|amount|package)", r"you (have )?won", r"lucky draw",
      r"inaam", r"انعام", r"claim (your|now)"]),
]

CONF_CAP = 0.95


def heuristic_classify(text: str) -> dict:
    t = (text or "").lower()
    score, evidence = 0, []
    for label, weight, patterns in SIGNALS:
        if any(re.search(p, t) for p in patterns):
            score += weight
            evidence.append(label)

    words = re.findall(r"\w+", t)
    if score >= 3:
        # evidence-based: more independent signals -> more confidence, capped
        conf = min(CONF_CAP, round(0.5 + 0.08 * score, 2))
        return {"result": "suspicious", "confidence": conf, "evidence": evidence,
                "explanation": "This message has warning signs: " + "; ".join(evidence) + "."}
    if score >= 1:
        return {"result": "unknown", "confidence": 0.4, "evidence": evidence,
                "explanation": "Some warning signs but not enough to be sure: "
                               + "; ".join(evidence) + ". A person should check."}
    if len(words) < 3:
        return {"result": "unknown", "confidence": 0.3, "evidence": [],
                "explanation": "The message is too short to judge."}
    return {"result": "likely_legitimate", "confidence": 0.6, "evidence": [],
            "explanation": "No common scam signals were found. This does not prove it is genuine."}
