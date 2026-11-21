"""Transparent duplicate / inconsistency flags. Flags are NOT proof of fraud,
and they never change a case's status (that is a human's / A's job)."""
import re
from difflib import SequenceMatcher
from itertools import combinations
from typing import Dict, List
from .schemas import AnomalyFlag, AnomalyResult

_MUHAMMAD = re.compile(r"\b(muhammad|mohammad|muhammed|mohammed|mohd|md|muhammed)\b")


def normalize_name(name: str) -> str:
    n = re.sub(r"[^a-z ]", "", (name or "").lower())
    n = _MUHAMMAD.sub("muhammad", n)
    return " ".join(n.split())


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


def find_anomalies(records: List[Dict]) -> AnomalyResult:
    flags: List[AnomalyFlag] = []
    for r in records:
        missing = [f for f in ("name", "cnic") if not r.get(f)]
        if missing:
            flags.append(AnomalyFlag(kind="missing_field", record_ids=[str(r.get("id"))],
                                     detail=f"missing: {', '.join(missing)}"))
    for a, b in combinations(records, 2):
        ids = [str(a.get("id")), str(b.get("id"))]
        sim = name_similarity(a.get("name", ""), b.get("name", ""))
        same_cnic = a.get("cnic") and a.get("cnic") == b.get("cnic")
        if same_cnic and sim >= 0.8:
            flags.append(AnomalyFlag(kind="possible_duplicate", record_ids=ids,
                         detail=f"same CNIC and similar names (similarity {sim:.2f})"))
        elif same_cnic:
            flags.append(AnomalyFlag(kind="inconsistent_fields", record_ids=ids,
                         detail=f"same CNIC but different names (similarity {sim:.2f})"))
        elif sim >= 0.9 and a.get("phone") and a.get("phone") == b.get("phone"):
            flags.append(AnomalyFlag(kind="possible_duplicate", record_ids=ids,
                         detail="very similar names and same phone, different CNIC"))
    return AnomalyResult(
        flags=flags, confidence=0.6 if flags else 0.8,
        explanation=("Possible issues found. These are hints, not proof; a person should check."
                     if flags else "No duplicate or inconsistency hints found."),
        model_version="anomaly-rules-v1", requires_human_review=bool(flags))
