# Citizen + Helper frontend (Member C)

> PROTOTYPE ONLY. Not an official service. Every person, CNIC and phone number is synthetic.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # 29 behaviour tests (offline queue, consent, routing, names, scam rules)
npm run build      # production build + PWA service worker
```

`VITE_USE_MOCK=true` (default) runs against an in-browser mock of A's API that **enforces the same rules a real server must**
(role, tenant, consent, idempotency, audit). Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` once A's backend is up.
Demo logins: one tap on the login screen. Mock: `zainab@ / imran@ / helper@ / officer@demo.lastmile`, password `demo1234`. Real backend: `citizen@ / helper@ / officer@test.com`, password `TestPassword123!`.

## Connected to the real backend (Nov 22)

Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL=<backend>/api/v1`. Tested end to end against A's FastAPI:
citizen apply (online, offline queue, lost replies), track, scam check, consent withdraw / share again, helper 403 after
withdrawal, officer queue + approve, citizen sees the decision.

How the frontend fits A's API without backend changes:

| A's API | Frontend handling (`src/api/real.ts`, `src/api/caseCodec.ts`) |
|---|---|
| `Case` is `{title, description, status}` | Structured application + advisory triage stored as JSON in `description`; reference = `LM-` + first 8 chars of the id |
| No Idempotency-Key | Each application carries a `client_ref`; before retrying a ref, the app looks it up on the server first. Tested with every reply dropped: no duplicates |
| `POST /rules/evaluate` | Called before creating the case; rule version + evaluation id shown as sources. If it fails, the case is still accepted and marked for a person |
| Citizen needs a family | First application creates the citizen's family (`POST /families/`) |
| Helpers cannot grant consent | "Ask for permission" tells the helper the family must share from their own phone or via the officer |
| Audit log is officer-only | Citizen "who used my data" is hidden in real mode |
| List routes end in `/` | All collection calls use the trailing slash (a 307 redirect breaks cross-origin calls) |

Status vocabulary is now A's everywhere (UI, mock, officer pages): `submitted, under_review, needs_information, approved, rejected, closed`.

### Demo data (backend)

```bash
python scripts/create_test_user.py   # citizen@ / helper@ / officer@test.com, TestPassword123!
python scripts/seed_demo.py          # Zainab's family, 12 helper families (incl. look-alike names), rule BISP-2026 v1
```

### Deploy

- Render (backend): env `CORS_ORIGINS=https://<your-vercel-domain>`; `*.vercel.app` URLs starting with `last-mile` are allowed by default (`CORS_ORIGIN_REGEX`). Run the two scripts above once.
- Vercel (frontend): root directory `frontend`, framework Vite, env `VITE_API_BASE_URL=https://<render-app>.onrender.com/api/v1`, `VITE_USE_MOCK=false`. `frontend/vercel.json` handles SPA routes.

## What is real and what is simulated

| Real (runs in the browser) | Simulated |
|---|---|
| IndexedDB drafts + sync queue with Idempotency-Key, backoff, failure states | Backend (until A lands): `src/api/mockServer.ts` |
| PWA app shell (opens with no signal); API and documents never cached | Scam verdict: mirror of B's `heuristics.py` (`rules-fallback-v1`) |
| Photo blur/darkness check on the phone (Laplacian variance, threshold 60 = B's) | OCR fields after upload (`ocr-mock-v1`) |
| Browser speech-to-text and text-to-speech (Urdu where the phone has it) | Network conditions via the "Test signal" button |
| Spelling-tolerant name search and look-alike flags (never merged) | |

## Feature map against the brief

| Brief | Where |
|---|---|
| Ch.01 cost of being wrong | Routing never approves; 0.60 / 0.90 thresholds shown on the case trace (`ConfidenceMeter showThresholds`) |
| Ch.02 "I am not sure" | Scam `unknown` verdict in its own violet colour; `human_review` route with plain reason |
| Ch.03 bad data | `lib/names.ts`; helper list flags Muhammad/Mohammad look-alikes, never merges; CNIC duplicate -> 409 |
| Ch.04 rules change | D publishes a rule in mock -> the next citizen case uses it; old cases keep `rule_version_id` |
| Ch.05 explain + audit | Case page: plain reason + expandable trace (confidence, rule version, sources) |
| Ch.06 consent take-back | Consent page -> helper gets 403 `CONSENT_WITHDRAWN` at once; citizen sees "who used my data", incl. the blocked attempt |
| Ch.07 works for everyone | One question per screen, icons, read-aloud on every screen, voice answers with confirmation, Urdu RTL, offline |
| Ch.08 scams | Highlighted trigger words inside the person's message; never claims a message is genuine |
| Bonus: Helper Mode | 40 families, colour per family, confirm-before-switch, drafts kept per family, 3-minute idle lock |
| Bonus: Offline-First Sync | Queue survives reloads; "flaky" mode proves a lost reply does not create a second case |

## For A: contract the UI expects (proposed; shapes in `src/api/types.ts`)

- `POST /cases` reads header **`Idempotency-Key`**. Same key again -> return the existing case (200) with `idempotent_replay: true`.
- Errors use `{ error: { code, message, details } }`. Codes the UI handles: `CONSENT_WITHDRAWN`, `CONSENT_REQUIRED` (403),
  `DUPLICATE_APPLICATION` (409, `details: { id, reference }`), `VALIDATION_ERROR` (422), `UNAUTHENTICATED` (401).
- Case response needs `reference`, `user_explanation` (plain words), `reasons[]`, `missing_fields[]`, `history[]`, `rule_version_id`, `sources[]`.
- Endpoints not in the original map but needed: `GET /consents` (citizen: own; helper: `?family_id=`, own record only),
  `PATCH /consents/{id}` (change scope), `GET /consents/access-log` (citizen: who read/was refused), `GET /families/{id}`,
  `GET /cases?family_id=`.
- Never trust `family_id`/`submitted_via` from a citizen; derive from the token (the mock does this).

## For B

- `src/lib/scamRules.ts` mirrors `heuristics.py`. If weights change, update both (test `scam rules mirror B` will catch drift).
- Suggestion: return `evidence_spans: [{start, end, label}]` so the UI highlights from the server instead of re-matching.

## For D (shared files touched)

- Removed PowerShell `@' ... '@ | Set-Content` wrappers from `useRoleGuard.ts`, `RuleEditorPage.tsx`, `RuleVersionHistory.tsx`, `DEMO_SCRIPT.md` (they broke the build). No logic change; separate commit.
- `api/client.ts`: exported `http`, `getToken`, `Me`; mock rules/cases now read the shared mock DB so citizen cases appear in your queue and published rules drive new cases. Officer UI untouched.
- Added `frontend/package.json`, Vite/Tailwind/PWA config, `App.tsx` router (your pages mounted at `/admin`, `/admin/review`, `/admin/cases/:id`, `/admin/rules`, officer role only).
- Review queue and dashboard now use A's statuses (`submitted` by default); `reviewCase` sends `{status, reason}` to `/cases/{id}/review`; real-mode queue/detail are mapped from A's cases.

## Demo path (about 2 minutes)

1. Zainab (Urdu by default): Apply. Tap Listen; answer one step by voice. At Review, Test signal -> No signal -> Send: "Saved on this phone".
2. Test signal -> Connected: banner turns to "Sent. Reference LM-26-xxxxx". Open it: plain reason, then the trace.
3. Test signal -> Unstable, submit another (different CNIC): reply is lost, retry returns the same case, one record.
4. Scam check -> first example: red verdict, words underlined. Third example: "We are not sure" -> a person will check.
5. Who can see my data -> Stop sharing with Rukhsana. Log in as helper -> open Zainab -> 403 Access stopped.
6. Helper search "mohd aslam": all spellings found, look-alikes flagged, not merged.

## Known limitations

- Urdu strings need a native-speaker pass; Urdu speech depends on the phone's installed voices (we say so on screen).
- Voice input needs Chrome/Edge (Web Speech API); otherwise the UI offers typing.
- Photos are not queued offline (privacy choice); they are added from the case page when online.
