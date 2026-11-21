"""RAG = Retrieval-Augmented Generation. Here: Retrieve, then Answer only from what was found.

Version 1 uses simple word-overlap search (no heavy install). Later you can
swap `retrieve` for ChromaDB without changing anything else.
The answer is EXTRACTED from a trusted chunk, so nothing can be invented.
If nothing matches well enough -> abstain.
"""
import re
from typing import List, Optional, Dict

from app.knowledge.ingest import load_chunks
from .schemas import RAGAnswer, Source

STOP = set("a an the is are was be to of in on for and or do does i my me you your it this that "
           "how what can should will with by at from if as about".split())
MIN_MATCH_FRACTION = 0.5   # at least half of the question's key words must appear
MIN_MATCH_WORDS = 2


def _tokens(text: str) -> set:
    out = set()
    for w in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if w in STOP:
            continue
        out.add(w[:-1] if len(w) > 3 and w.endswith("s") else w)
    return out


def retrieve(question: str, chunks: List[Dict]):
    q = _tokens(question)
    best, best_frac, best_n = None, 0.0, 0
    for c in chunks:
        n = len(q & _tokens(c["text"]))
        frac = n / len(q) if q else 0.0
        if (frac, n) > (best_frac, best_n):
            best, best_frac, best_n = c, frac, n
    return best, best_frac, best_n


def answer_question(question: str, chunks: Optional[List[Dict]] = None) -> RAGAnswer:
    chunks = chunks if chunks is not None else load_chunks()
    best, frac, n = retrieve(question, chunks)
    if best is None or n < MIN_MATCH_WORDS or frac < MIN_MATCH_FRACTION:
        return RAGAnswer(
            answer="I could not find this in my trusted sources, so I won't guess. "
                   "A person can help you with this.",
            abstained=True, confidence=0.0,
            explanation="No trusted source supports an answer.",
            sources=[], model_version="rag-extractive-v1", requires_human_review=True)
    conf = round(min(0.9, 0.4 + 0.5 * frac), 2)
    return RAGAnswer(
        answer=best["text"], abstained=False, confidence=conf,
        explanation=f"Answer copied from a trusted source; {n} key words matched.",
        sources=[Source(title=best["title"], identifier=best["identifier"], chunk_id=best["chunk_id"])],
        model_version="rag-extractive-v1", requires_human_review=conf < 0.6)
