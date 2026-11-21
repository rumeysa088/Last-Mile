# Last-Mile API Contract & Integration Specification

**API Version:** 1.0.0
**Base URL:** `/api/v1`
**Framework:** FastAPI (Python 3.11+)
**Authentication:** JWT Bearer Token (`Authorization: Bearer <token>`)
**Traceability:** Request ID returned via `X-Request-ID` header on all responses
**CORS Enabled Origins:** `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`

---

## 1. Authentication & Security Model

All private endpoints require a Bearer token in the request header:
```http
Authorization: Bearer <access_token>
```

Authority (identity, tenant, role) is derived strictly from the validated token and database record. Frontends cannot override `tenant_id` or `user_id`.

### The Three Supported Roles
1. `citizen` – Submits cases, uploads documents, manages consent, runs scam checks.
2. `community_helper` – Accesses only assigned families and cases with active, unwithdrawn consent; submits assisted applications and uploads supporting documents.
3. `officer_admin` – Reviews cases with mandatory decision reasons, assigns helpers, manages versioned rules, runs eligibility evaluations, and views audit trails.

### Standardized Error Format
All 4xx and 5xx responses strictly adhere to the Shared Team Integration Guide specification while preserving top-level keys for backwards compatibility:
```json
{
  "detail": "Descriptive error message",
  "code": "HTTP_403",
  "request_id": "c138fbd2-0c9f-431f-9da3-ffc94e82df7b",
  "error": {
    "code": "HTTP_403",
    "message": "Descriptive error message",
    "details": null,
    "request_id": "c138fbd2-0c9f-431f-9da3-ffc94e82df7b"
  }
}
```

---

## 2. Authentication Endpoints

### 2.1 Login
`POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "citizen@lastmile.local",
  "password": "CitizenPass123!"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
  "token_type": "bearer"
}
```

### 2.2 Get Current User
`GET /api/v1/auth/me`
Requires: Valid Bearer Token (Any authenticated user)

**Response (200 OK):**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "citizen@lastmile.local",
  "full_name": "Fatima Bibi",
  "role": "citizen",
  "tenant_id": "8bb3858c-9c76-4d56-a188-75f84d651234",
  "is_active": true,
  "created_at": "2026-11-22T01:00:00Z"
}
```

### 2.3 Health Check
`GET /health`
Public endpoint; requires no authentication.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "last-mile-api"
}
```

---

## 3. Case Management Endpoints

### 3.1 Create Case
`POST /api/v1/cases/`
Requires: `citizen` or `community_helper` (with active assignment & consent)

**Request Body:**
```json
{
  "title": "Emergency Heating and Nutrition Assistance",
  "description": "Family winter aid support request",
  "family_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

**Response (201 Created):**
```json
{
  "id": "e4b2d158-d142-4752-9457-36e4b85c1234",
  "tenant_id": "8bb3858c-9c76-4d56-a188-75f84d651234",
  "family_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
  "created_by": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "assigned_to": null,
  "title": "Emergency Heating and Nutrition Assistance",
  "description": "Family winter aid support request",
  "status": "submitted",
  "created_at": "2026-11-22T01:30:00Z",
  "updated_at": "2026-11-22T01:30:00Z"
}
```

### 3.2 List Cases
`GET /api/v1/cases/?limit=50&offset=0&status=submitted`
Requires: Any authenticated user (filtered strictly by tenant & role permissions)

*Security Note:* Community helpers can only view cases where their assigned family has an **active, unwithdrawn consent**. Direct assignment cannot bypass consent.

**Response (200 OK):**
```json
[
  {
    "id": "e4b2d158-d142-4752-9457-36e4b85c1234",
    "tenant_id": "8bb3858c-9c76-4d56-a188-75f84d651234",
    "family_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
    "created_by": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "assigned_to": "4fa85f64-5717-4562-b3fc-2c963f66afa7",
    "title": "Emergency Heating and Nutrition Assistance",
    "description": "Family winter aid support request",
    "status": "submitted",
    "created_at": "2026-11-22T01:30:00Z",
    "updated_at": "2026-11-22T01:30:00Z"
  }
]
```

### 3.3 Get Case Detail
`GET /api/v1/cases/{case_id}`
Requires: Authorized citizen owner, authorized helper (active consent), or officer.

### 3.4 Update Case
`PATCH /api/v1/cases/{case_id}`
Requires: Authorized case owner or officer. Note: `status` cannot be changed via PATCH.

**Request Body:**
```json
{
  "title": "Updated Case Title",
  "description": "Updated household narrative"
}
```

### 3.5 Assign Case to Helper
`POST /api/v1/cases/{case_id}/assign`
Requires: `officer_admin` (verifies helper active consent before assignment)

**Request Body:**
```json
{
  "helper_id": "4fa85f64-5717-4562-b3fc-2c963f66afa7"
}
```

### 3.6 Officer Case Review & Decision
`POST /api/v1/cases/{case_id}/review`
Requires: `officer_admin`

**Allowed Status Transitions:**
- `submitted` -> `under_review`, `needs_information`, `approved`, `rejected`
- `under_review` -> `needs_information`, `approved`, `rejected`, `closed`
- `needs_information` -> `submitted`, `under_review`, `approved`, `rejected`
- `approved` / `rejected` -> `closed`

*Mandatory Reason:* A documented reason is required when transitioning to `approved`, `rejected`, or `needs_information`.

**Request Body:**
```json
{
  "status": "approved",
  "reason": "All CNIC documents verified and income falls below safety net threshold."
}
```

**Response (200 OK):** Updated Case record.

---

## 4. Family & Consent Lifecycle Endpoints

### 4.1 Create Family
`POST /api/v1/families/`
Requires: `citizen` or `officer_admin`

**Request Body:**
```json
{
  "name": "Bibi Household"
}
```

### 4.2 List Families
`GET /api/v1/families/?limit=50&offset=0`
Requires: `citizen` (sees own), `community_helper` (sees assigned families with active consent), `officer_admin` (sees tenant families).

### 4.3 Grant Granular Consent (Canonical)
`POST /api/v1/consents/`
Requires: `citizen` (family owner) or `officer_admin`

**Request Body:**
```json
{
  "family_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
  "recipient_id": "4fa85f64-5717-4562-b3fc-2c963f66afa7",
  "subject_id": null,
  "purpose": "case_support",
  "scope": "read_write"
}
```

**Response (201 Created):**
```json
{
  "id": "1fa85f64-5717-4562-b3fc-2c963f66afb1",
  "family_id": "7fa85f64-5717-4562-b3fc-2c963f66afa6",
  "granted_by": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "subject_id": null,
  "recipient_id": "4fa85f64-5717-4562-b3fc-2c963f66afa7",
  "purpose": "case_support",
  "scope": "read_write",
  "status": "active",
  "granted_at": "2026-11-22T01:35:00Z",
  "withdrawn_at": null
}
```

### 4.4 Withdraw Specific Consent (Canonical)
`POST /api/v1/consents/{consent_id}/withdraw`
Requires: `citizen` (family owner) or `officer_admin`

Withdraws *only* this specific consent record immediately without terminating unrelated consents for other helpers or purposes. All helper access under this consent is immediately revoked.

**Response (200 OK):** Updated consent with `status: "withdrawn"` and `withdrawn_at: "<timestamp>"`.

### 4.5 Assign Helper to Family
`POST /api/v1/families/{family_id}/assign-helper?helper_id=<UUID>`
Requires: `officer_admin`

Assigns an active community helper to assist a family. Note that helper access remains blocked until the citizen also grants active consent.

**Response (200 OK):**
```json
{
  "message": "Helper assigned successfully"
}
```

### 4.6 Unassign Helper from Family
`POST /api/v1/families/{family_id}/unassign-helper?helper_id=<UUID>`
Requires: `officer_admin`

Deactivates the helper's active assignment to this family.

**Response (200 OK):**
```json
{
  "message": "Helper unassigned successfully"
}
```

### 4.7 Grant Family Consent (Legacy Endpoint)
`POST /api/v1/families/{family_id}/consent`
Requires: `citizen` (family owner) or `officer_admin`

Legacy convenience endpoint for granting consent directly against a family path.

**Request Body:**
```json
{
  "scope": "read_write"
}
```

**Response (200 OK):** Consent object.

### 4.8 Withdraw All Family Consents (Legacy Endpoint)
`POST /api/v1/families/{family_id}/consent/withdraw`
Requires: `citizen` (family owner) or `officer_admin`

Withdraws all active consents for the specified family.

**Response (200 OK):**
```json
{
  "message": "Consent withdrawn successfully"
}
```

---

## 5. Document Management Endpoints

### 5.1 Upload Document
`POST /api/v1/cases/{case_id}/documents`
Requires: Authorized citizen or authorized helper (with active consent)

- **Content-Type:** `multipart/form-data`
- **Field:** `file`
- **Allowed Types:** PDF, JPEG, PNG (validated via content magic bytes)
- **Max File Size:** 10 MB

**Response (201 Created):**
```json
{
  "id": "8fa85f64-5717-4562-b3fc-2c963f66afc8",
  "case_id": "e4b2d158-d142-4752-9457-36e4b85c1234",
  "uploaded_by": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "filename": "cnic_verification.pdf",
  "content_type": "application/pdf",
  "created_at": "2026-11-22T01:40:00Z"
}
```

### 5.2 List Documents
`GET /api/v1/cases/{case_id}/documents`

### 5.3 Download Document
`GET /api/v1/cases/{case_id}/documents/{document_id}/download`
Streams file content. Download access is logged in the tenant audit trail.

---

## 6. Versioned Platform Rules & Deterministic Eligibility Engine

### 6.1 Create Rule Set
`POST /api/v1/rules/sets`
Requires: `officer_admin`

**Request Body:**
```json
{
  "name": "Kafalat Cash Assistance Criteria",
  "description": "Standard welfare threshold rules"
}
```

### 6.2 Create Draft Rule Version
`POST /api/v1/rules/sets/{set_id}/versions`
Requires: `officer_admin`

**Request Body:**
```json
{
  "rules": {
    "criteria": [
      {
        "field": "monthly_income",
        "operator": "<=",
        "value": 45000,
        "description": "Monthly income must not exceed 45,000 PKR"
      },
      {
        "field": "household_size",
        "operator": ">=",
        "value": 3,
        "description": "Minimum household size must be 3"
      }
    ]
  }
}
```

**Response (201 Created):**
```json
{
  "id": "2fa85f64-5717-4562-b3fc-2c963f66afd2",
  "rule_set_id": "9fa85f64-5717-4562-b3fc-2c963f66af99",
  "version": 1,
  "rules": { ... },
  "status": "draft",
  "created_by": "5fa85f64-5717-4562-b3fc-2c963f66af55",
  "published_at": null,
  "created_at": "2026-11-22T01:45:00Z"
}
```

### 6.3 Publish Rule Version
`POST /api/v1/rules/versions/{version_id}/publish`
Requires: `officer_admin`

Publishes the version and archives previous active versions in that set. Published versions are **immutable**.

### 6.4 Deterministic Evaluation
`POST /api/v1/rules/evaluate`
Requires: Authenticated user (typically `officer_admin` during review)

Evaluates applicant data deterministically. Missing fields return `unknown` (they are NOT silently treated as failure). AI models never make eligibility decisions.

**Request Body:**
```json
{
  "rule_version_id": "2fa85f64-5717-4562-b3fc-2c963f66afd2",
  "case_id": "e4b2d158-d142-4752-9457-36e4b85c1234",
  "applicant_data": {
    "monthly_income": 32000,
    "household_size": 3
  }
}
```

**Response (200 OK):**
```json
{
  "id": "4fa85f64-5717-4562-b3fc-2c963f66afe4",
  "rule_version_id": "2fa85f64-5717-4562-b3fc-2c963f66afd2",
  "case_id": "e4b2d158-d142-4752-9457-36e4b85c1234",
  "evaluated_by": "5fa85f64-5717-4562-b3fc-2c963f66af55",
  "input_snapshot": {
    "monthly_income": 32000,
    "household_size": 3
  },
  "result": {
    "rule_set_id": "9fa85f64-5717-4562-b3fc-2c963f66af99",
    "rule_version": 1,
    "criteria_evaluated": 2,
    "breakdown": [
      {"field": "monthly_income", "operator": "<=", "expected": 45000, "actual": 32000, "status": "pass"},
      {"field": "household_size", "operator": ">=", "expected": 3, "actual": 3, "status": "pass"}
    ]
  },
  "missing_fields": [],
  "outcome": "eligible",
  "evaluated_at": "2026-11-22T01:46:00Z"
}
```

### 6.5 Get Historical Evaluation Record
`GET /api/v1/rules/evaluations/{evaluation_id}`
Requires: Authenticated user (scoped by tenant and case ownership)

Retrieves the immutable snapshot and criteria breakdown of a previous rule evaluation. Cross-tenant access is prohibited.

**Response (200 OK):** Evaluation record as shown in 6.4.

### 6.6 List Active Platform Rules (Legacy)
`GET /api/v1/rules/active`
Requires: Any authenticated user

Returns currently active legacy platform rules.

**Response (200 OK):**
```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "title": "Income Threshold",
    "description": "Family income rule",
    "version": 1,
    "is_active": true,
    "published_at": "2026-11-22T01:00:00Z",
    "created_at": "2026-11-22T01:00:00Z"
  }
]
```

### 6.7 Publish Platform Rule (Legacy)
`POST /api/v1/rules/{rule_id}/publish`
Requires: `officer_admin`

Publishes a legacy platform rule and deactivates any previous versions with the same title.

**Response (200 OK):** Updated platform rule record with `is_active: true`.

---

## 7. AI Backend Integration (Member B Boundary)

### 7.1 Scam Message Check
`POST /api/v1/scam/check`
Requires: Any authenticated user

Calls Member B's AI classifier with automatic fallback to mock mode if the provider or AI service is unavailable.

**Request Body:**
```json
{
  "message": "Congratulations! You won BISP cash. Send your OTP and PIN immediately to claim.",
  "language": "en"
}
```

**Response (200 OK):**
```json
{
  "result": "suspicious",
  "confidence": 0.88,
  "explanation": "The message contains high-risk triggers commonly found in government impersonation scams: pin, otp, won.",
  "evidence": ["pin", "otp", "won"],
  "sources": [],
  "model_version": "mock-rules-v1",
  "requires_human_review": false
}
```

### 7.2 Voice Speech-to-Text (STT)
`POST /api/v1/voice/stt`
Requires: Any authenticated user
Content-Type: `multipart/form-data` with field `audio`

**Response (200 OK):**
```json
{
  "transcript": "Citizen application assistance request: Please verify household status.",
  "language": "en",
  "confidence": 0.92,
  "needs_confirmation": true,
  "model_version": "mock-voice-v1"
}
```

---

## 8. Audit Logging Endpoints

### 8.1 List Audit Trail
`GET /api/v1/audit/logs?limit=50&offset=0&action=case.reviewed`
Requires: `officer_admin`

**Response (200 OK):**
```json
[
  {
    "id": "7fa85f64-5717-4562-b3fc-2c963f66af77",
    "tenant_id": "8bb3858c-9c76-4d56-a188-75f84d651234",
    "actor_id": "5fa85f64-5717-4562-b3fc-2c963f66af55",
    "actor_role": "officer_admin",
    "request_id": "c138fbd2-0c9f-431f-9da3-ffc94e82df7b",
    "action": "case.reviewed",
    "entity_type": "case",
    "entity_id": "e4b2d158-d142-4752-9457-36e4b85c1234",
    "outcome": "success",
    "details": {
      "previous_status": "submitted",
      "new_status": "approved",
      "reason": "All CNIC documents verified."
    },
    "change_summary": {
      "changed_fields": ["new_status", "previous_status", "reason"]
    },
    "created_at": "2026-11-22T01:48:00Z"
  }
]
```
