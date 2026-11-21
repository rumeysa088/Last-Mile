

from fastapi import FastAPI

from app.api.v1.auth import router as auth_router
from app.api.v1.cases import router as cases_router
from app.api.v1.families import router as families_router
from app.api.v1.documents import router as documents_router
from app.api.v1.rules import router as rules_router


app = FastAPI(
    title="Last-Mile API",
    description="Backend API for the Last-Mile platform",
    version="1.0.0",
)


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


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "last-mile-api",
    }
