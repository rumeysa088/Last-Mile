from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Consent, Family


def verify_family_consent(
    db: Session,
    family_id: UUID,
    tenant_id: UUID,
):
    family = db.query(Family).filter(
        Family.id == family_id,
        Family.tenant_id == tenant_id,
    ).first()

    if not family:
        raise HTTPException(
            status_code=404,
            detail="Family not found",
        )

    consent = db.query(Consent).filter(
        Consent.family_id == family_id,
        Consent.status == "active",
        Consent.withdrawn_at.is_(None),
    ).first()

    if not consent:
        raise HTTPException(
            status_code=403,
            detail="Active consent is required to access this family",
        )

    return consent