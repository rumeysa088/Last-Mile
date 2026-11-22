


from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.cases import router as cases_router
from app.api.v1.families import router as families_router
from app.api.v1.consent import router as consent_router
from app.api.v1.documents import router as documents_router
from app.api.v1.rules import router as rules_router
from app.api.v1.audit import router as audit_router
from app.api.v1.scam import router as scam_router
from app.api.v1.voice import router as voice_router
from app.core.errors import register_error_handlers

from app.services.audit import (
    set_request_id,
    reset_request_id,
)


app = FastAPI(
    title="Last-Mile API",
    description="Backend API for the Last-Mile platform",
    version="1.0.0",
)

# Register CORS middleware for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Generate a unique ID for each HTTP request.
    Make it available to audit logging and return it
    in the X-Request-ID response header.
    """

    request_id = str(uuid4())
    token = set_request_id(request_id)

    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        reset_request_id(token)


# Register standardized error handlers
register_error_handlers(app)


# Authentication
app.include_router(
    auth_router,
    prefix="/api/v1",
)

# Case management and officer review
app.include_router(
    cases_router,
    prefix="/api/v1",
)

# Family management, consent and helper assignments
app.include_router(
    families_router,
    prefix="/api/v1",
)

# Case document uploads and downloads
app.include_router(
    documents_router,
    prefix="/api/v1",
)

# Versioned platform rules
app.include_router(
    rules_router,
    prefix="/api/v1",
)

# Granular consent management
app.include_router(
    consent_router,
    prefix="/api/v1",
)

# Audit log review (officer/admin)
app.include_router(
    audit_router,
    prefix="/api/v1",
)

# AI Integration: Scam check and Voice STT
app.include_router(
    scam_router,
    prefix="/api/v1",
)

app.include_router(
    voice_router,
    prefix="/api/v1",
)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "last-mile-api",
    }
