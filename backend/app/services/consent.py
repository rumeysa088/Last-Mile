from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import Consent, Family, FamilyMember, User
from app.services.audit import log_action


def get_family_in_tenant(
    db: Session,
    family_id: UUID,
    tenant_id: UUID,
) -> Family:
    family = db.query(Family).filter(
        Family.id == family_id,
        Family.tenant_id == tenant_id,
    ).first()

    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found",
        )

    return family


def verify_family_authority(
    family: Family,
    user: User,
) -> None:
    if user.role != "officer_admin" and family.created_by != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage consent for your own family",
        )


def create_consent_record(
    db: Session,
    user: User,
    tenant_id: UUID,
    family_id: UUID,
    scope: str,
    subject_id: UUID | None = None,
    recipient_id: UUID | None = None,
    purpose: str | None = None,
) -> Consent:
    family = get_family_in_tenant(db, family_id, tenant_id)
    verify_family_authority(family, user)

    # Validate recipient if provided
    if recipient_id is not None:
        recipient = db.query(User).filter(
            User.id == recipient_id,
            User.tenant_id == tenant_id,
            User.role == "community_helper",
            User.is_active.is_(True),
        ).first()

        if not recipient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active community helper recipient not found in this tenant",
            )

    # Validate subject if provided
    if subject_id is not None:
        member = db.query(FamilyMember).filter(
            FamilyMember.id == subject_id,
            FamilyMember.family_id == family_id,
        ).first()

        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family member subject not found in this family",
            )

    consent = Consent(
        family_id=family_id,
        granted_by=user.id,
        subject_id=subject_id,
        recipient_id=recipient_id,
        purpose=purpose or "case_support",
        scope=scope,
        status="active",
        granted_at=datetime.now(timezone.utc),
    )

    db.add(consent)
    db.flush()

    log_action(
        db=db,
        actor_id=user.id,
        action="consent.granted",
        entity_type="consent",
        entity_id=consent.id,
        details={
            "family_id": str(family_id),
            "recipient_id": str(recipient_id) if recipient_id else None,
            "purpose": consent.purpose,
            "scope": consent.scope,
        },
    )

    db.commit()
    db.refresh(consent)
    return consent


def withdraw_consent_record(
    db: Session,
    consent_id: UUID,
    user: User,
    tenant_id: UUID,
) -> Consent:
    consent = db.query(Consent).filter(Consent.id == consent_id).first()

    if not consent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consent record not found",
        )

    family = get_family_in_tenant(db, consent.family_id, tenant_id)
    verify_family_authority(family, user)

    if consent.status == "withdrawn":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This consent is already withdrawn",
        )

    consent.status = "withdrawn"
    consent.withdrawn_at = datetime.now(timezone.utc)

    log_action(
        db=db,
        actor_id=user.id,
        action="consent.withdrawn",
        entity_type="consent",
        entity_id=consent.id,
        details={
            "family_id": str(consent.family_id),
            "recipient_id": str(consent.recipient_id) if consent.recipient_id else None,
        },
    )

    db.commit()
    db.refresh(consent)
    return consent


def check_active_helper_consent(
    db: Session,
    family_id: UUID,
    helper_id: UUID,
) -> Consent | None:
    """
    Check if a helper has active, unwithdrawn consent for a family.
    Matches helper-specific consent or general (recipient_id is None) consent.
    """
    return db.query(Consent).filter(
        Consent.family_id == family_id,
        Consent.status == "active",
        Consent.withdrawn_at.is_(None),
        (Consent.recipient_id == helper_id) | (Consent.recipient_id.is_(None)),
    ).first()
