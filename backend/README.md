# Last-Mile Backend Service

This directory contains the central FastAPI backend foundation for the Last-Mile platform.

## Directory Structure

```
backend/
├── alembic/              # Database migration configuration & version scripts
│   ├── env.py
│   └── versions/         # Alembic migration scripts
├── app/
│   ├── api/v1/           # API route handlers (auth, cases, families, consent, documents, rules, audit, scam, voice)
│   ├── core/             # Configuration, security, RBAC dependencies, standardized errors
│   ├── db/               # SQLAlchemy engine and session management
│   ├── models/           # SQLAlchemy 2.0 ORM models
│   ├── schemas/          # Pydantic v2 request & response schemas
│   ├── services/         # Business logic (audit, consent, deterministic rule engine, AI adapter)
│   └── tests/            # Automated test suites
├── scripts/              # Backend helper utilities
├── storage/              # Local storage for documents and Chroma vectors
├── alembic.ini           # Alembic configuration file
└── requirements.txt      # Backend Python dependencies
```

## Local Development Commands

```bash
# Activate virtual environment
.venv\Scripts\Activate.ps1   # Windows
source .venv/bin/activate    # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000

# Execute full test suite
$env:PYTHONPATH="backend"; pytest app/tests -v
```
