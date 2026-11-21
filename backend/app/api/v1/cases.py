from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Case, User, Family, Consent
from app.models.family_assignment import FamilyAssignment
from app.schemas.cases import CaseCreate, CaseUpdate, CaseResponse
from app.services.audit import log_action

router = APIRouter(prefix="/cases", tags=["Cases"])

ALLOWED_CASE_STATUSES = {
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "needs_information",
    "closed",
}

VALID_STATUS_TRANSITIONS = {
    "submitted": {"under_review", "approved", "rejected", "needs_information", "closed"},
    "under_review": {"approved", "rejected", "needs_information", "closed"},
    "needs_information": {"submitted", "under_review", "approved", "rejected", "closed"},
    "approved": {"closed"},
    "rejected": {"closed"},
    "closed": set(),
}

HIGH_IMPACT_STATUSES = {"approved", "rejected", "needs_information"}


class CaseAssignRequest(BaseModel):
    helper_id: UUID


class CaseReviewRequest(BaseModel):
    status: str = Field(min_length=1, max_length=50)
    reason: str | None = Field(default=None, max_length=1000)


def verify_case_access(
    db: Session,
    case: Case,
    user: User,
) -> None:
    if user.role == "officer_admin":
        return

    if case.family_id is None:
        if case.created_by != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot access this case",
            )
        return

    family = db.query(Family).filter(
        Family.id == case.family_id,
        Family.tenant_id == user.tenant_id,
    ).first()

    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family not found",
        )

    if user.role == "citizen":
        if family.created_by != user.id and case.created_by != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot access this family's cases",
            )
        return

    if user.role == "community_helper":
        # Helper MUST have active, unwithdrawn consent
        consent = db.query(Consent).filter(
            Consent.family_id == family.id,
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
            (Consent.recipient_id == user.id) | (Consent.recipient_id.is_(None)),
        ).first()

        if not consent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active consent is required to access this case",
            )

        assignment = db.query(FamilyAssignment).filter(
            FamilyAssignment.family_id == family.id,
            FamilyAssignment.helper_id == user.id,
            FamilyAssignment.is_active.is_(True),
        ).first()

        if not assignment and case.assigned_to != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Case or family is not assigned to you",
            )
        return

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def get_case_in_tenant(
    db: Session,
    case_id: UUID,
    tenant_id: UUID,
) -> Case:
    case = db.query(Case).filter(
        Case.id == case_id,
        Case.tenant_id == tenant_id,
    ).first()

    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    return case


@router.post(
    "/",
    response_model=CaseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    data: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    if data.family_id:
        family = db.query(Family).filter(
            Family.id == data.family_id,
            Family.tenant_id == tenant_id,
        ).first()

        if not family:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found",
            )

        if current_user.role == "citizen" and family.created_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only create cases for your own families",
            )

        if current_user.role == "community_helper":
            # Assisted case creation requires active assignment and consent
            assignment = db.query(FamilyAssignment).filter(
                FamilyAssignment.family_id == data.family_id,
                FamilyAssignment.helper_id == current_user.id,
                FamilyAssignment.is_active.is_(True),
            ).first()

            consent = db.query(Consent).filter(
                Consent.family_id == data.family_id,
                Consent.status == "active",
                Consent.withdrawn_at.is_(None),
                (Consent.recipient_id == current_user.id) | (Consent.recipient_id.is_(None)),
            ).first()

            if not assignment or not consent:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Active family assignment and consent are required to submit assisted applications",
                )
    else:
        if current_user.role == "community_helper":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Community helpers must link assisted cases to a family",
            )

    case = Case(
        tenant_id=tenant_id,
        family_id=data.family_id,
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        status="submitted",
    )

    db.add(case)
    db.flush()

    details = {"title": case.title}
    if case.family_id:
        details["family_id"] = str(case.family_id)

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.created",
        entity_type="case",
        entity_id=case.id,
        details=details,
    )

    db.commit()
    db.refresh(case)
    return case


@router.get("/", response_model=list[CaseResponse])
def list_cases(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    query = db.query(Case).filter(Case.tenant_id == tenant_id)

    if status_filter:
        query = query.filter(Case.status == status_filter)

    if current_user.role == "citizen":
        owned_family_ids = select(Family.id).filter(
            Family.tenant_id == tenant_id,
            Family.created_by == current_user.id,
        )

        query = query.filter(
            (Case.created_by == current_user.id)
            | (Case.family_id.in_(owned_family_ids))
        )

    elif current_user.role == "community_helper":
        # Helper can ONLY see cases with ACTIVE, UNWITHDRAWN consent
        consented_family_ids = select(Consent.family_id).filter(
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
            (Consent.recipient_id == current_user.id) | (Consent.recipient_id.is_(None)),
        )

        assigned_family_ids = select(FamilyAssignment.family_id).filter(
            FamilyAssignment.helper_id == current_user.id,
            FamilyAssignment.is_active.is_(True),
        )

        # Direct case assignment AND family assignment both REQUIRE active consent
        query = query.filter(
            Case.family_id.isnot(None),
            Case.family_id.in_(consented_family_ids),
            (Case.family_id.in_(assigned_family_ids)) | (Case.assigned_to == current_user.id),
        )


    return query.order_by(Case.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_case_in_tenant(db, case_id, tenant_id)
    verify_case_access(db, case, current_user)
    return case


@router.patch("/{case_id}", response_model=CaseResponse)
def update_case(
    case_id: UUID,
    data: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_case_in_tenant(db, case_id, tenant_id)
    verify_case_access(db, case, current_user)

    updates = data.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one field must be provided",
        )

    if "title" in updates and (
        updates["title"] is None or not updates["title"].strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Title cannot be empty",
        )

    if "status" in updates:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Use the officer review endpoint to change case status",
        )

    for field, value in updates.items():
        setattr(case, field, value)

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.updated",
        entity_type="case",
        entity_id=case.id,
        details=updates,
    )

    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/assign", response_model=CaseResponse)
def assign_case(
    case_id: UUID,
    data: CaseAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_case_in_tenant(db, case_id, tenant_id)

    if not case.family_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A case must belong to a family before helper assignment",
        )

    helper = db.query(User).filter(
        User.id == data.helper_id,
        User.tenant_id == tenant_id,
        User.role == "community_helper",
        User.is_active.is_(True),
    ).first()

    if not helper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active community helper not found in this tenant",
        )

    consent = db.query(Consent).filter(
        Consent.family_id == case.family_id,
        Consent.status == "active",
        Consent.withdrawn_at.is_(None),
        (Consent.recipient_id == helper.id) | (Consent.recipient_id.is_(None)),
    ).first()

    if not consent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active family consent for this helper is required before assignment",
        )

    # Automatically ensure active family assignment exists
    family_assign = db.query(FamilyAssignment).filter(
        FamilyAssignment.family_id == case.family_id,
        FamilyAssignment.helper_id == helper.id,
        FamilyAssignment.is_active.is_(True),
    ).first()

    if not family_assign:
        family_assign = FamilyAssignment(
            family_id=case.family_id,
            helper_id=helper.id,
            assigned_by=current_user.id,
            is_active=True,
        )
        db.add(family_assign)

    previous_helper = case.assigned_to
    case.assigned_to = helper.id

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.assigned",
        entity_type="case",
        entity_id=case.id,
        details={
            "helper_id": str(helper.id),
            "previous_helper_id": (
                str(previous_helper) if previous_helper else None
            ),
        },
    )

    db.commit()
    db.refresh(case)
    return case


@router.post("/{case_id}/review", response_model=CaseResponse)
def review_case(
    case_id: UUID,
    data: CaseReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    case = get_case_in_tenant(db, case_id, tenant_id)

    target_status = data.status.strip().lower()

    if target_status not in ALLOWED_CASE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid case status '{target_status}'. Must be one of {sorted(ALLOWED_CASE_STATUSES)}",
        )

    if target_status == case.status:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Case is already in '{target_status}' status",
        )

    allowed_next = VALID_STATUS_TRANSITIONS.get(case.status, set())
    if target_status not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status transition from '{case.status}' to '{target_status}'. Allowed transitions: {sorted(allowed_next)}",
        )

    if target_status in HIGH_IMPACT_STATUSES and (not data.reason or not data.reason.strip()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"A documented reason is required when setting case status to '{target_status}'",
        )

    previous_status = case.status
    case.status = target_status

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.reviewed",
        entity_type="case",
        entity_id=case.id,
        details={
            "previous_status": previous_status,
            "new_status": case.status,
            "reason": data.reason.strip() if data.reason else None,
        },
    )

    db.commit()
    db.refresh(case)
    return case
