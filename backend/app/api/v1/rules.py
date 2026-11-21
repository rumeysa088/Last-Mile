
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.models import PlatformRule, User
from app.schemas.rules import RuleCreate, RuleResponse
from app.services.audit import log_action

router = APIRouter(prefix="/rules", tags=["Platform Rules"])


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
            status_code=422,
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
            status_code=404,
            detail="Platform rule not found",
        )

    if rule.is_active:
        raise HTTPException(
            status_code=409,
            detail="This rule version is already published",
        )

    # Deactivate the previously published version
    # of this same rule title.
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
