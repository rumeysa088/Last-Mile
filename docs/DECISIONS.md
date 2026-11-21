# AI Engine Decisions (Member B)

> PROTOTYPE ONLY. Not an official service. All data is synthetic/mock.

## 1. Provider choice
- Default: **mock mode** (`LLM_MODE=mock`) - works with no internet, no key, no account.
- Optional live mode: any OpenAI-compatible API via env vars `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. Keys stay server-side only.
- Every failure (no key, timeout, rate limit, outage, bad JSON) falls back to transparent rules (`rules-fallback-v1`).

## 2. Confidence formula (NOT the model's self-reported number)
Rule signals have weights (credential request 3, fee/money 3, short link 2, link 1, urgency 1, relief/prize lure 1).
- score >= 3 -> `suspicious`, confidence = min(0.95, 0.5 + 0.08 x score)
- score 1-2 -> `unknown`, confidence 0.40
- score 0 -> `likely_legitimate`, confidence 0.60 (always "verify via official channel")
- AI and rules disagree -> `unknown`, 0.40, human review
- Empty/too-short text -> `unknown`
Limitation: weights are hand-chosen, not statistically calibrated. Needs a larger labeled set.

## 3. The cost of being wrong (Challenge 01)
Assume a wrong approval costs ~10x a slow human review (C_wrong = 10, C_review = 1).
Acting alone is worth it only if P(wrong) x 10 < 1, i.e. P(wrong) < 0.10 -> confidence >= 0.90.
| Confidence | Action |
|---|---|
| >= 0.90 and no risk flags | auto_ok |
| 0.60 - 0.90 | ask_more_proof |
| < 0.60, unknown, conflict, low quality, or high-impact | escalate_to_human |
The 10x figure is an assumption for the prototype; the admin can change it.

## 4. Model versioning
Every output has `model_version` (`mock-v1`, `rules-fallback-v1`, provider model name, `rag-extractive-v1`, `anomaly-rules-v1`, `tesseract-x.y`, `stt-mock-v1`). Backend (A) stores it in the audit log.

## 5. RAG
Extractive only: the answer is copied from a trusted chunk, with title + identifier + chunk id. If fewer than half the question's key words (and at least 2) match, it abstains. Demo corpus is placeholder text; replace with real official public text before the final demo. A's rule engine is authoritative for eligibility.

## 6. OCR and voice
OCR reads text only; it never verifies identity. Blurry/small/dark images -> low quality -> human review. Sharpness threshold (60) is a first guess to tune on samples.
Voice is MOCK. Languages really tested with a real engine: none yet. Urdu is NOT claimed; the user is offered text entry. Transcript always needs user confirmation.

## 7. Evaluation (tiny, honest)
`python -m app.services.ai.evaluate` on 9 hand-written messages: 4/4 scams caught, 0 false alarms, 0 missed, 2 sent to a human. Too small to prove accuracy; extend to 40+ messages incl. Roman Urdu.

## 8. Known limitations
Keyword rules can be evaded by rephrasing; Roman-Urdu coverage is small; no image forgery detection yet; no real STT; RAG uses word overlap, not embeddings.
