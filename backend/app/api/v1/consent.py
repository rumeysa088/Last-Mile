from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Consent, Family, User
from app.schemas.consent import ConsentCreate, ConsentResponse
from app.services.consent import (
    create_consent_record,
    withdraw_consent_record,
    get_family_in_tenant,
    verify_family_authority,
)

router = APIRouter(prefix="/consents", tags=["Consent"])


@router.post(
    "/",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED,
)
def grant_consent(
    data: ConsentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("citizen", "officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Grant granular consent for family assistance."""
    return create_consent_record(
        db=db,
        user=current_user,
        tenant_id=tenant_id,
        family_id=data.family_id,
        scope=data.scope,
        subject_id=data.subject_id,
        recipient_id=data.recipient_id,
        purpose=data.purpose,
    )


@router.post(
    "/{consent_id}/withdraw",
    response_model=ConsentResponse,
)
def withdraw_consent(
    consent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("citizen", "officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Withdraw an individual consent record immediately."""
    return withdraw_consent_record(
        db=db,
        consent_id=consent_id,
        user=current_user,
        tenant_id=tenant_id,
    )


@router.get(
    "/",
    response_model=list[ConsentResponse],
)
def list_consents(
    family_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """List consent records visible to the current user."""
    query = db.query(Consent).join(Family, Family.id == Consent.family_id).filter(
        Family.tenant_id == tenant_id
    )

    if family_id:
        query = query.filter(Consent.family_id == family_id)

    if current_user.role == "citizen":
        query = query.filter(Family.created_by == current_user.id)
    elif current_user.role == "community_helper":
        query = query.filter(
            (Consent.recipient_id == current_user.id) | (Consent.recipient_id.is_(None))
        )

    return query.order_by(Consent.granted_at.desc()).offset(offset).limit(limit).all()


@router.get(
    "/{consent_id}",
    response_model=ConsentResponse,
)
def get_consent(
    consent_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Retrieve details of a specific consent record."""
    consent = db.query(Consent).filter(Consent.id == consent_id).first()
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consent record not found",
        )

    family = get_family_in_tenant(db, consent.family_id, tenant_id)

    if current_user.role == "citizen" and family.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this consent record",
        )
    elif current_user.role == "community_helper":
        if consent.recipient_id is not None and consent.recipient_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this consent record",
            )

    return consent
