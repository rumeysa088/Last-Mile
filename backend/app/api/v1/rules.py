from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.core.tenant import get_current_tenant
from app.db.session import get_db
from app.models.models import Case, PlatformRule, RuleEvaluation, RuleSet, RuleVersion, User
from app.schemas.rules import (
    EvaluationRequest,
    EvaluationResponse,
    RuleCreate,
    RuleResponse,
    RuleSetCreate,
    RuleSetResponse,
    RuleVersionCreate,
    RuleVersionResponse,
)
from app.services.audit import log_action
from app.services.rule_engine import run_deterministic_evaluation

router = APIRouter(prefix="/rules", tags=["Platform Rules"])


# =========================================================================
# Canonical Versioned Rules Engine APIs
# =========================================================================

@router.post(
    "/sets",
    response_model=RuleSetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_rule_set(
    data: RuleSetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Create a new rule set."""
    rule_set = RuleSet(
        tenant_id=tenant_id,
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        created_by=current_user.id,
    )
    db.add(rule_set)
    db.flush()

    log_action(
        db=db,
        actor_id=current_user.id,
        action="rule_set.created",
        entity_type="rule_set",
        entity_id=rule_set.id,
        details={"name": rule_set.name},
    )

    db.commit()
    db.refresh(rule_set)
    return rule_set


@router.get(
    "/sets",
    response_model=list[RuleSetResponse],
)
def list_rule_sets(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """List rule sets available in current tenant or global."""
    return db.query(RuleSet).filter(
        (RuleSet.tenant_id == tenant_id) | (RuleSet.tenant_id.is_(None))
    ).order_by(RuleSet.created_at.desc()).offset(offset).limit(limit).all()


@router.get(
    "/sets/{set_id}",
    response_model=RuleSetResponse,
)
def get_rule_set(
    set_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Retrieve an individual rule set."""
    rule_set = db.query(RuleSet).filter(
        RuleSet.id == set_id,
        (RuleSet.tenant_id == tenant_id) | (RuleSet.tenant_id.is_(None)),
    ).first()
    if not rule_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule set not found",
        )
    return rule_set


@router.post(
    "/sets/{set_id}/versions",
    response_model=RuleVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_rule_version(
    set_id: UUID,
    data: RuleVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Create a draft version in a rule set. Published versions are immutable."""
    rule_set = db.query(RuleSet).filter(
        RuleSet.id == set_id,
        (RuleSet.tenant_id == tenant_id) | (RuleSet.tenant_id.is_(None)),
    ).first()
    if not rule_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule set not found",
        )

    latest_ver = db.query(RuleVersion).filter(
        RuleVersion.rule_set_id == set_id
    ).order_by(RuleVersion.version.desc()).first()

    next_version = (latest_ver.version + 1) if latest_ver else 1

    version_entry = RuleVersion(
        rule_set_id=set_id,
        version=next_version,
        rules=data.rules,
        status="draft",
        created_by=current_user.id,
    )

    db.add(version_entry)
    db.flush()

    log_action(
        db=db,
        actor_id=current_user.id,
        action="rule_version.created",
        entity_type="rule_version",
        entity_id=version_entry.id,
        details={
            "rule_set_id": str(set_id),
            "version": next_version,
            "status": "draft",
        },
    )

    db.commit()
    db.refresh(version_entry)
    return version_entry


@router.get(
    "/sets/{set_id}/versions",
    response_model=list[RuleVersionResponse],
)
def list_rule_versions(
    set_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """List all historical versions of a rule set."""
    rule_set = db.query(RuleSet).filter(
        RuleSet.id == set_id,
        (RuleSet.tenant_id == tenant_id) | (RuleSet.tenant_id.is_(None)),
    ).first()
    if not rule_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule set not found",
        )

    return db.query(RuleVersion).filter(
        RuleVersion.rule_set_id == set_id
    ).order_by(RuleVersion.version.desc()).all()


@router.post(
    "/versions/{version_id}/publish",
    response_model=RuleVersionResponse,
)
def publish_rule_version(
    version_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("officer_admin")),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Publish a draft rule version. Archives any previously active version."""
    version = db.query(RuleVersion).filter(
        RuleVersion.id == version_id
    ).with_for_update().first()

    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule version not found",
        )

    # Tenant isolation check: officer can only publish versions of their tenant's rule sets or global rule sets
    rule_set = db.query(RuleSet).filter(
        RuleSet.id == version.rule_set_id,
    ).first()

    if not rule_set or (rule_set.tenant_id is not None and rule_set.tenant_id != tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to publish rule versions for another tenant",
        )

    if version.status == "published":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This rule version is already published",
        )

    # Archive previous active version in this set
    db.query(RuleVersion).filter(
        RuleVersion.rule_set_id == version.rule_set_id,
        RuleVersion.status == "published",
        RuleVersion.id != version.id,
    ).update(
        {RuleVersion.status: "archived"},
        synchronize_session=False,
    )

    version.status = "published"
    version.published_at = datetime.now(timezone.utc)

    log_action(
        db=db,
        actor_id=current_user.id,
        action="rule_version.published",
        entity_type="rule_version",
        entity_id=version.id,
        details={
            "rule_set_id": str(version.rule_set_id),
            "version": version.version,
        },
    )

    db.commit()
    db.refresh(version)
    return version


@router.post(
    "/evaluate",
    response_model=EvaluationResponse,
)
def evaluate_rules(
    data: EvaluationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Deterministically evaluate applicant data against a published rule version."""
    return run_deterministic_evaluation(
        db=db,
        user=current_user,
        applicant_data=data.applicant_data,
        rule_version_id=data.rule_version_id,
        rule_set_id=data.rule_set_id,
        case_id=data.case_id,
    )


@router.get(
    "/evaluations/{evaluation_id}",
    response_model=EvaluationResponse,
)
def get_evaluation(
    evaluation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    tenant_id: UUID = Depends(get_current_tenant),
):
    """Retrieve immutable historical evaluation record and snapshot."""
    evaluation = db.query(RuleEvaluation).filter(
        RuleEvaluation.id == evaluation_id
    ).first()

    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule evaluation record not found",
        )

    # Tenant isolation and access verification
    if evaluation.case_id:
        case = db.query(Case).filter(Case.id == evaluation.case_id).first()
        if not case or case.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rule evaluation record not found",
            )
        from app.api.v1.cases import verify_case_access
        verify_case_access(db, case, current_user, required_scope="read_only")
    else:
        rule_set = (
            db.query(RuleSet)
            .join(RuleVersion, RuleVersion.rule_set_id == RuleSet.id)
            .filter(RuleVersion.id == evaluation.rule_version_id)
            .first()
        )
        if rule_set and rule_set.tenant_id is not None and rule_set.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rule evaluation record not found",
            )
        if current_user.role != "officer_admin" and evaluation.evaluated_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this evaluation record",
            )

    return evaluation


# =========================================================================
# Legacy PlatformRule APIs (Retained for Backwards Compatibility)
# =========================================================================

@router.get("/active", response_model=list[RuleResponse])
def list_active_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(PlatformRule).filter(
        PlatformRule.is_active.is_(True)
    ).order_by(
        PlatformRule.title.asc()
    ).all()


@router.get("/", response_model=list[RuleResponse])
def list_all_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("officer_admin")
    ),
):
    return db.query(PlatformRule).order_by(
        PlatformRule.title.asc(),
        PlatformRule.version.desc(),
    ).all()


@router.post(
    "/",
    response_model=RuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_rule(
    data: RuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("officer_admin")
    ),
):
    title = data.title.strip()
    description = data.description.strip()

    if not title or not description:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Title and description cannot be empty",
        )

    latest_rule = db.query(PlatformRule).filter(
        PlatformRule.title == title
    ).order_by(
        PlatformRule.version.desc()
    ).first()

    next_version = (
        latest_rule.version + 1 if latest_rule else 1
    )

    rule = PlatformRule(
        title=title,
        description=description,
        version=next_version,
        is_active=False,
        created_by=current_user.id,
    )

    db.add(rule)
    db.flush()

    log_action(
        db=db,
        actor_id=current_user.id,
        action="rule.created",
        entity_type="platform_rule",
        entity_id=rule.id,
        details={
            "title": title,
            "version": next_version,
        },
    )

    db.commit()
    db.refresh(rule)

    return rule


@router.post("/{rule_id}/publish", response_model=RuleResponse)
def publish_rule(
    rule_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("officer_admin")
    ),
):
    rule = db.query(PlatformRule).filter(
        PlatformRule.id == rule_id
    ).with_for_update().first()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Platform rule not found",
        )

    if rule.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This rule version is already published",
        )

    db.query(PlatformRule).filter(
        PlatformRule.title == rule.title,
        PlatformRule.is_active.is_(True),
        PlatformRule.id != rule.id,
    ).update(
        {PlatformRule.is_active: False},
        synchronize_session=False,
    )

    rule.is_active = True
    rule.published_at = datetime.now(timezone.utc)

    log_action(
        db=db,
        actor_id=current_user.id,
        action="rule.published",
        entity_type="platform_rule",
        entity_id=rule.id,
        details={
            "title": rule.title,
            "version": rule.version,
        },
    )

    db.commit()
    db.refresh(rule)

    return rule
