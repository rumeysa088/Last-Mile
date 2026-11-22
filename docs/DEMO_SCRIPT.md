@'
# DEMO SCRIPT — Last Mile (Prototype)

> Prototype only. Not an official government service. All data is synthetic.

## Demo story (5–7 minutes)

### 1. Setup (30 s)
- Open `http://localhost:5173` (frontend) and `http://localhost:8000/docs` (backend Swagger).
- One line: "Three roles — citizen, community helper, officer/admin. One platform. Mock data throughout."

### 2. Citizen — relief application + scam check (2 min)
- Log in as the widow citizen (synthetic account).
- Apply for relief: voice narration, large icons, Urdu labels where supported.
- Upload a mock CNIC. Show OCR extracting fields; note missing field detection.
- Visit "Scam check" with a fake relief-payment SMS. Show classification + reasons + confidence + "flag for human review".
- Toggle airplane mode mid-application → show saved-locally banner → reconnect → sync (single submission).

### 3. Community helper (1 min)
- Log in as helper.
- Dashboard shows 40 synthetic families. Switch between two. Consent is per-citizen.
- Withdraw consent for one. Attempt to open their application → access denied (server-side, not just frontend).

### 4. Officer / Admin — review + rules (2 min)
- Log in as officer_admin.
- Queue sorted by AI confidence. Open a low-confidence case.
- Show AI context panel: summary, reasons, sources, rule version, OCR warnings.
- Approve / reject / request-info requires a reason; server returns the confirmed status.
- Switch to Rule Editor: create draft v4, publish. Show v3 remains archived; a new case uses v4.

### 5. Audit (30 s)
- Open `/api/v1/auditor/logs` (as officer_admin, read-only flag) or Swagger.
- Show the entries just generated: citizen submit, AI classify, officer decision, rule publish, consent withdraw.

### 6. Close
- "Wrong approvals cost more than slow ones — every risky decision stops for a human, with the reason recorded."
- "Every AI output is a suggestion. Every final decision is a human action in the audit log."

## Known limitations (say this out loud)
- No real government integration — identity, payment, data-exchange are mocks.
- AI runs with a mock fallback if no LLM API key is set; the mock is deterministic.
- Forged-document detection is out of scope; OCR inconsistencies are flagged for review, not judged.
- Urdu TTS depends on the browser voice available.
'@ | Set-Content -Encoding UTF8 docs\DEMO_SCRIPT.md