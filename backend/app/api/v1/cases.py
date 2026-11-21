
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Case, User, Family, Consent
from app.models.family_assignment import FamilyAssignment
from app.schemas.cases import CaseCreate, CaseUpdate, CaseResponse
from app.services.audit import log_action

router = APIRouter(prefix="/cases", tags=["Cases"])


class CaseAssignRequest(BaseModel):
    helper_id: UUID


class CaseReviewRequest(BaseModel):
    status: str = Field(min_length=1, max_length=50)


def verify_case_access(
    db: Session,
    case: Case,
    user: User,
):
    if user.role == "officer_admin":
        return

    if case.family_id is None:
        if case.created_by != user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot access this case",
            )
        return

    family = db.query(Family).filter(
        Family.id == case.family_id,
        Family.tenant_id == user.tenant_id,
    ).first()

    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    if user.role == "citizen":
        if family.created_by != user.id:
            raise HTTPException(
                status_code=403,
                detail="You cannot access this family's cases",
            )
        return

    if user.role == "community_helper":
        assignment = db.query(FamilyAssignment).filter(
            FamilyAssignment.family_id == family.id,
            FamilyAssignment.helper_id == user.id,
            FamilyAssignment.is_active.is_(True),
        ).first()

        consent = db.query(Consent).filter(
            Consent.family_id == family.id,
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
        ).first()

        if not consent:
            raise HTTPException(
                status_code=403,
                detail="Active consent is required",
            )

        if not assignment and case.assigned_to != user.id:
            raise HTTPException(
                status_code=403,
                detail="Case or family is not assigned to you",
            )
        return

    raise HTTPException(status_code=403, detail="Access denied")


def get_case_in_tenant(
    db: Session,
    case_id: UUID,
    tenant_id: UUID,
):
    case = db.query(Case).filter(
        Case.id == case_id,
        Case.tenant_id == tenant_id,
    ).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

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
    if current_user.role not in ("citizen", "officer_admin"):
        raise HTTPException(
            status_code=403,
            detail="You are not allowed to create cases",
        )

    if data.family_id:
        family = db.query(Family).filter(
            Family.id == data.family_id,
            Family.tenant_id == tenant_id,
        ).first()

        if not family:
            raise HTTPException(status_code=404, detail="Family not found")

        if (
            current_user.role == "citizen"
            and family.created_by != current_user.id
        ):
            raise HTTPException(
                status_code=403,
                detail="You can only create cases for your own families",
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

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.created",
        entity_type="case",
        entity_id=case.id,
        details={"title": case.title},
    )

    db.commit()
    db.refresh(case)
    return case


@router.get("/", response_model=list[CaseResponse])
def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    query = db.query(Case).filter(Case.tenant_id == tenant_id)

    if current_user.role == "citizen":
        owned_family_ids = db.query(Family.id).filter(
            Family.tenant_id == tenant_id,
            Family.created_by == current_user.id,
        ).subquery()

        query = query.filter(
            (Case.created_by == current_user.id)
            | (Case.family_id.in_(owned_family_ids))
        )

    elif current_user.role == "community_helper":
        assigned_family_ids = db.query(
            FamilyAssignment.family_id
        ).join(
            Consent,
            Consent.family_id == FamilyAssignment.family_id,
        ).filter(
            FamilyAssignment.helper_id == current_user.id,
            FamilyAssignment.is_active.is_(True),
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
        ).subquery()

        query = query.filter(
            (Case.family_id.in_(assigned_family_ids))
            | (Case.assigned_to == current_user.id)
        )

    return query.all()


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
            status_code=422,
            detail="At least one field must be provided",
        )

    if "title" in updates and (
        updates["title"] is None or not updates["title"].strip()
    ):
        raise HTTPException(status_code=422, detail="Title cannot be empty")

    if "status" in updates:
        raise HTTPException(
            status_code=403,
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
            status_code=422,
            detail="A case must belong to a family before helper assignment",
        )

    consent = db.query(Consent).filter(
        Consent.family_id == case.family_id,
        Consent.status == "active",
        Consent.withdrawn_at.is_(None),
    ).first()

    if not consent:
        raise HTTPException(
            status_code=403,
            detail="Active family consent is required before assignment",
        )

    helper = db.query(User).filter(
        User.id == data.helper_id,
        User.tenant_id == tenant_id,
        User.role == "community_helper",
        User.is_active.is_(True),
    ).first()

    if not helper:
        raise HTTPException(
            status_code=404,
            detail="Active community helper not found in this tenant",
        )

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

    previous_status = case.status
    case.status = data.status.strip()

    log_action(
        db=db,
        actor_id=current_user.id,
        action="case.reviewed",
        entity_type="case",
        entity_id=case.id,
        details={
            "previous_status": previous_status,
            "new_status": case.status,
        },
    )

    db.commit()
    db.refresh(case)
    return case
