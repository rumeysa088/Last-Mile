
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Family, Consent, User
from app.models.family_assignment import FamilyAssignment
from app.schemas.families import (
    FamilyCreate,
    FamilyResponse,
    ConsentCreate,
    ConsentResponse,
)
from app.services.audit import log_action

router = APIRouter(prefix="/families", tags=["Families"])


def get_family_in_tenant(
    db: Session,
    family_id: UUID,
    tenant_id: UUID,
):
    family = db.query(Family).filter(
        Family.id == family_id,
        Family.tenant_id == tenant_id,
    ).first()

    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    return family


def verify_family_owner_or_officer(
    family: Family,
    user: User,
):
    if user.role != "officer_admin" and family.created_by != user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only manage your own family",
        )


def get_accessible_family(
    db: Session,
    family_id: UUID,
    tenant_id: UUID,
    user: User,
):
    family = get_family_in_tenant(db, family_id, tenant_id)

    if user.role == "community_helper":
        assignment = db.query(FamilyAssignment).filter(
            FamilyAssignment.family_id == family_id,
            FamilyAssignment.helper_id == user.id,
            FamilyAssignment.is_active.is_(True),
        ).first()

        if not assignment:
            raise HTTPException(
                status_code=403,
                detail="Family not assigned to you",
            )

        consent = db.query(Consent).filter(
            Consent.family_id == family_id,
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
        ).first()

        if not consent:
            raise HTTPException(
                status_code=403,
                detail="Active consent required",
            )

    elif user.role == "citizen":
        verify_family_owner_or_officer(family, user)

    return family


@router.post(
    "/",
    response_model=FamilyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_family(
    data: FamilyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("citizen", "officer_admin")
    ),
    tenant_id: UUID = Depends(get_current_tenant),
):
    family = Family(
        tenant_id=tenant_id,
        created_by=current_user.id,
        name=data.name,
    )

    db.add(family)
    db.flush()

    log_action(
        db,
        current_user.id,
        "family.created",
        "family",
        family.id,
        {"name": family.name},
    )

    db.commit()
    db.refresh(family)
    return family


@router.get("/", response_model=list[FamilyResponse])
def list_families(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    query = db.query(Family).filter(Family.tenant_id == tenant_id)

    if current_user.role == "citizen":
        query = query.filter(Family.created_by == current_user.id)

    elif current_user.role == "community_helper":
        assigned_ids = db.query(FamilyAssignment.family_id).filter(
            FamilyAssignment.helper_id == current_user.id,
            FamilyAssignment.is_active.is_(True),
        ).subquery()

        consented_ids = db.query(Consent.family_id).filter(
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
        ).subquery()

        query = query.filter(
            Family.id.in_(assigned_ids),
            Family.id.in_(consented_ids),
        )

    return query.all()


@router.get("/{family_id}", response_model=FamilyResponse)
def get_family(
    family_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    return get_accessible_family(
        db, family_id, tenant_id, current_user
    )


@router.post("/{family_id}/consent", response_model=ConsentResponse)
def grant_consent(
    family_id: UUID,
    data: ConsentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("citizen", "officer_admin")
    ),
    tenant_id: UUID = Depends(get_current_tenant),
):
    family = get_family_in_tenant(db, family_id, tenant_id)
    verify_family_owner_or_officer(family, current_user)

    consent = Consent(
        family_id=family_id,
        granted_by=current_user.id,
        scope=data.scope,
        status="active",
    )

    db.add(consent)
    db.flush()

    log_action(
        db,
        current_user.id,
        "consent.granted",
        "family",
        family_id,
        {"scope": data.scope},
    )

    db.commit()
    db.refresh(consent)
    return consent


@router.post("/{family_id}/consent/withdraw")
def withdraw_consent(
    family_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("citizen", "officer_admin")
    ),
    tenant_id: UUID = Depends(get_current_tenant),
):
    family = get_family_in_tenant(db, family_id, tenant_id)
    verify_family_owner_or_officer(family, current_user)

    consents = db.query(Consent).filter(
        Consent.family_id == family_id,
        Consent.status == "active",
        Consent.withdrawn_at.is_(None),
    ).all()

    if not consents:
        raise HTTPException(
            status_code=404,
            detail="No active consent found",
        )

    for consent in consents:
        consent.status = "withdrawn"
        consent.withdrawn_at = datetime.now(timezone.utc)

    log_action(
        db,
        current_user.id,
        "consent.withdrawn",
        "family",
        family_id,
    )

    db.commit()

    return {"message": "Consent withdrawn successfully"}


@router.post("/{family_id}/assign-helper")
def assign_helper(
    family_id: UUID,
    helper_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("officer_admin")
    ),
    tenant_id: UUID = Depends(get_current_tenant),
):
    get_family_in_tenant(db, family_id, tenant_id)

    helper = db.query(User).filter(
        User.id == helper_id,
        User.tenant_id == tenant_id,
        User.role == "community_helper",
        User.is_active.is_(True),
    ).first()

    if not helper:
        raise HTTPException(
            status_code=404,
            detail="Active helper not found",
        )

    existing = db.query(FamilyAssignment).filter(
        FamilyAssignment.family_id == family_id,
        FamilyAssignment.helper_id == helper_id,
        FamilyAssignment.is_active.is_(True),
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Helper already assigned",
        )

    assignment = FamilyAssignment(
        family_id=family_id,
        helper_id=helper_id,
        assigned_by=current_user.id,
        is_active=True,
    )

    db.add(assignment)

    log_action(
        db,
        current_user.id,
        "family.helper_assigned",
        "family",
        family_id,
        {"helper_id": str(helper_id)},
    )

    db.commit()

    return {"message": "Helper assigned successfully"}


@router.post("/{family_id}/unassign-helper")
def unassign_helper(
    family_id: UUID,
    helper_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("officer_admin")
    ),
    tenant_id: UUID = Depends(get_current_tenant),
):
    get_family_in_tenant(db, family_id, tenant_id)

    assignment = db.query(FamilyAssignment).filter(
        FamilyAssignment.family_id == family_id,
        FamilyAssignment.helper_id == helper_id,
        FamilyAssignment.is_active.is_(True),
    ).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Active assignment not found",
        )

    assignment.is_active = False

    log_action(
        db,
        current_user.id,
        "family.helper_unassigned",
        "family",
        family_id,
        {"helper_id": str(helper_id)},
    )

    db.commit()

    return {"message": "Helper unassigned successfully"}
