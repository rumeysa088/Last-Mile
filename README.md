# Last-Mile: Inclusive Social Protection & Citizen Welfare Platform

Last-Mile is a resilient, offline-capable welfare delivery and citizen empowerment platform designed to ensure vulnerable households can access critical social safety nets without administrative friction or fraud.

The platform provides dedicated, role-tailored workflows for **Citizens**, **Community Helpers**, and **Officer Administrators**, reinforced by multi-tenant data isolation, granular consent management, deterministic versioned rules engines, and AI-powered scam detection.

---

## 1. System Architecture & Personas

- **Citizen:** Submits welfare applications, uploads identity and income verification documents, manages assistance consent, and evaluates incoming messages for scam risks.
- **Community Helper:** Assists rural or illiterate beneficiaries through assisted applications, manages authorized document uploads, and works only under active, unwithdrawn family consent.
- **Officer Administrator:** Reviews cases with documented decision justifications, manages helper assignments, authors and publishes immutable versioned welfare rules, runs deterministic eligibility evaluations, and audits platform actions.

---

## 2. Technology Stack

- **Backend:** Python 3.11+, FastAPI, Starlette
- **Database & ORM:** PostgreSQL 16, SQLAlchemy 2.x, Alembic migrations
- **Authentication & Security:** PyJWT (HS256), Argon2 password hashing (`pwdlib`), context-bound Request IDs (`X-Request-ID`)
- **Testing:** Pytest, HTTPX (`TestClient`)
- **Containerization:** Docker Compose

---

## 3. Quick Start & Setup Guide

### Prerequisites
- Python 3.11 or higher
- Docker Desktop / Docker Engine (for PostgreSQL)
- Git

### Step 1: Clone and Configure Environment
```bash
git clone https://github.com/rumeysa088/Last-Mile.git
cd Last-Mile

# Copy development environment variables
cp .env.example .env
```

### Step 2: Start PostgreSQL Database
```bash
docker compose up -d
```
The database will be available at `localhost:5432` with credentials defined in `.env.example`.

### Step 3: Install Backend Dependencies
```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### Step 4: Apply Database Migrations
```bash
alembic upgrade head
```

### Step 5: Seed Synthetic Demo Data
From the repository root:
```bash
python scripts/seed_demo.py
```
This provisions a complete, idempotent demonstration environment with demo accounts across all three personas, sample families, cases, versioned welfare rules, and active consents.

### Step 6: Start FastAPI Backend Server
From the `backend` directory:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Interactive API documentation will be available at:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## 4. Demo Accounts & Credentials

The synthetic seed script generates the following test personas:

| Persona | Email | Password | Role | Responsibilities |
|---|---|---|---|---|
| **Citizen** | `citizen@lastmile.local` | `CitizenPass123!` | `citizen` | Submits applications, uploads documents, grants consent |
| **Community Helper** | `helper@lastmile.local` | `HelperPass123!` | `community_helper` | Assisted applications, family support under active consent |
| **Officer Admin** | `officer@lastmile.local` | `OfficerPass123!` | `officer_admin` | Case decisions with reasons, versioned rules, audit logs |

---

## 5. Running Automated Backend Tests

The backend includes a comprehensive, non-destructive automated test suite covering authentication, RBAC, cross-tenant isolation, granular consent withdrawal, document validation, status transitions, versioned rules, and AI integration:

From the repository root:
```bash
# Set PYTHONPATH and execute pytest
$env:PYTHONPATH="backend"; python -m pytest backend/app/tests -v
```

---

## 6. Key Security & Architectural Principles

1. **Strict Tenant Isolation:** Every query and write operation is scoped to the authenticated user's tenant. Frontend-supplied tenant IDs or user IDs are never trusted.
2. **Immediate Consent Revocation:** Helper access to case and family data requires active, unwithdrawn consent. Revoking consent immediately terminates all helper access across listing and detail endpoints.
3. **Deterministic Rules Engine:** Welfare eligibility evaluations are strictly deterministic and snapshot-recorded. Missing applicant information evaluates to `unknown`, never as a silent failure. AI models are never permitted to make eligibility decisions.
4. **Content-Validated Documents:** File uploads are inspected for actual magic-byte signatures (PDF, JPEG, PNG) to prevent arbitrary file upload and MIME spoofing.
5. **Comprehensive Audit Trails:** All state-modifying actions, officer review justifications, and document downloads are recorded with actor, role, tenant, timestamp, request ID, and sanitized change summaries.

---

## 7. Canonical API Specification

Refer to [`docs/api-contract.md`](docs/api-contract.md) for detailed request/response schemas, JSON examples, and query parameters across all endpoints.
