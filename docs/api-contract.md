
# Last-Mile API Contract

**API Version:** 1.0.0
**Base URL:** `/api/v1`
**Framework:** FastAPI
**Authentication:** JWT Bearer Token

## 1. Overview

The Last-Mile backend provides APIs for authentication, case management, family management, consent, helper assignments, document management, audit logging, and versioned platform rules.

Interactive API documentation is available through:

- Swagger UI: `/docs`
- OpenAPI JSON: `/openapi.json`

Health check:

- `GET /health`

## 2. Authentication

Protected endpoints require a valid JWT access token.

Include the token in the request header:

`Authorization: Bearer <access_token>`

### Login

`POST /api/v1/auth/login`

Authenticates a registered user and returns an access token.

Request body:

```json
{
  "email": "citizen@test.com",
  "password": "your-password"
}
```

Successful response: `200 OK`

```json
{
  "access_token": "<jwt-token>",
  "token_type": "bearer"
}
```

Invalid credentials: `401 Unauthorized`

### Current User

`GET /api/v1/auth/me`

Returns the authenticated user's profile.

Requires authentication.

## 3. User Roles

The backend supports three roles:

| Role | Responsibility |
|---|---|
| `citizen` | Creates and manages their own cases and families |
| `community_helper` | Supports explicitly assigned families with active consent |
| `officer_admin` | Manages cases, assignments, reviews, and platform rules |

Role and tenant authority are derived from the authenticated user record, not trusted from frontend request data.

## 4. Case Management

### Create Case

`POST /api/v1/cases/`

Creates a case for an authenticated citizen.

### List Cases

`GET /api/v1/cases/`

Returns cases visible to the authenticated user according to role, tenant, ownership, assignment, and consent restrictions.

### Get Case

`GET /api/v1/cases/{case_id}`

Returns an individual case if the user is authorized to access it.

### Update Case

`PATCH /api/v1/cases/{case_id}`

Updates an existing case, subject to authorization rules.

### Assign Case

`POST /api/v1/cases/{case_id}/assign`

Allows an authorized officer to assign a case to a community helper.

### Review Case

`POST /api/v1/cases/{case_id}/review`

Allows an authorized officer to review a case.

## 5. Family Management and Consent

### Create Family

`POST /api/v1/families/`

Creates a family record.

### List Families

`GET /api/v1/families/`

Returns families visible to the authenticated user.

### Get Family

`GET /api/v1/families/{family_id}`

Returns an authorized family record.

### Grant Consent

`POST /api/v1/families/{family_id}/consent`

Records consent for family support.

### Withdraw Consent

`POST /api/v1/families/{family_id}/consent/withdraw`

Withdraws previously granted consent.

### Assign Helper

`POST /api/v1/families/{family_id}/assign-helper`

Assigns a community helper to a family.

### Unassign Helper

`POST /api/v1/families/{family_id}/unassign-helper`

Removes a helper assignment.

Helpers can access only families assigned to them with active consent.

## 6. Document Management

### Upload Documents

`POST /api/v1/cases/{case_id}/documents`

Uploads a supported case document.

Supported formats:

- PDF
- JPEG
- PNG

Maximum file size: 10 MB.

### List Documents

`GET /api/v1/cases/{case_id}/documents`

Lists documents associated with an authorized case.

### Download Document

`GET /api/v1/cases/{case_id}/documents/{document_id}/download`

Downloads a document after case-access authorization.

## 7. Versioned Platform Rules

### List Active Rules

`GET /api/v1/rules/active`

Returns currently active platform rules.

### List Rules

`GET /api/v1/rules/`

Returns available platform rule records.

### Create Rule

`POST /api/v1/rules/`

Creates a new draft rule version.

### Publish Rule

`POST /api/v1/rules/{rule_id}/publish`

Publishes a rule version. Publishing a newer version deactivates the previously active version for that policy.

Rule creation and publishing are restricted to authorized officers.

## 8. Security and Authorization

The backend applies the following security principles:

- JWT-based authentication for protected endpoints.
- Password hashing using Argon2.
- Role-based access control.
- Tenant isolation for tenant-owned records.
- User identity and tenant context derived from the authenticated database record.
- Family ownership and helper assignment checks.
- Active consent required for helper access.
- Authorization checks before document access.
- Audit logging for important write operations.
- Versioned platform rules with controlled publishing.

## 9. HTTP Status Codes

| Status | Meaning |
|---|---|
| `200` | Request successful |
| `201` | Resource created |
| `400` | Invalid request |
| `401` | Authentication required or invalid credentials |
| `403` | Authenticated user lacks permission |
| `404` | Resource not found or inaccessible |
| `422` | Request validation failed |
| `500` | Internal server error |

Actual status codes depend on the endpoint and validation outcome.

## 10. API Testing

Run the backend test suite from the `backend` directory:

```powershell
python -m pytest app/tests -v
```

The current automated test suite covers:

- Health endpoint.
- Successful and unsuccessful login.
- Current-user authentication.
- Unauthenticated access restrictions.
- User role verification.
- Cross-tenant case isolation.
- Helper assignment and consent restrictions.
- Officer case assignment.
- Versioned rule publishing.
- Case creation audit logging.
