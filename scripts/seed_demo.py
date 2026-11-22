"""
Repeatable Synthetic Demo Seed Script for Last-Mile Platform.

Provisions synthetic demo tenant, accounts for all three roles,
sample family, family members, helper assignment, active consent,
sample case, rule set, published rule version, and baseline evaluation.

Execution is strictly idempotent.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Ensure backend directory is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.family_assignment import FamilyAssignment
from app.models.models import (
    AuditLog,
    Case,
    Consent,
    Family,
    FamilyMember,
    RuleEvaluation,
    RuleSet,
    RuleVersion,
    Tenant,
    User,
)


def seed_demo_data():
    db = SessionLocal()
    print("=" * 60)
    print("STARTING SYNTHETIC DEMO SEEDING FOR LAST-MILE")
    print("=" * 60)

    try:
        # 1. Tenant
        tenant_name = "Islamabad Capital Territory Facilitation Division"
        tenant = db.query(Tenant).filter(Tenant.name == tenant_name).first()
        if not tenant:
            tenant = Tenant(
                id=uuid4(),
                name=tenant_name,
            )
            db.add(tenant)
            db.flush()
            print(f"[+] Created Tenant: {tenant.name} ({tenant.id})")
        else:
            print(f"[*] Tenant exists: {tenant.name}")

        # 2. Users (all 3 personas)
        demo_users_spec = [
            {
                "email": "citizen@lastmile.local",
                "password": "CitizenPass123!",
                "full_name": "Fatima Bibi",
                "role": "citizen",
            },
            {
                "email": "helper@lastmile.local",
                "password": "HelperPass123!",
                "full_name": "Ali Hassan",
                "role": "community_helper",
            },
            {
                "email": "officer@lastmile.local",
                "password": "OfficerPass123!",
                "full_name": "Dr. Tariq Khan",
                "role": "officer_admin",
            },
        ]

        users = {}
        for spec in demo_users_spec:
            user = db.query(User).filter(User.email == spec["email"]).first()
            if not user:
                user = User(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    email=spec["email"],
                    full_name=spec["full_name"],
                    hashed_password=hash_password(spec["password"]),
                    role=spec["role"],
                    is_active=True,
                )
                db.add(user)
                db.flush()
                print(f"[+] Created User ({spec['role']}): {spec['email']}")
            else:
                print(f"[*] User exists ({spec['role']}): {spec['email']}")
            users[spec["role"]] = user

        citizen_user = users["citizen"]
        helper_user = users["community_helper"]
        officer_user = users["officer_admin"]

        # 3. Family
        family_name = "Bibi Household"
        family = db.query(Family).filter(
            Family.tenant_id == tenant.id,
            Family.name == family_name,
        ).first()

        if not family:
            family = Family(
                id=uuid4(),
                tenant_id=tenant.id,
                created_by=citizen_user.id,
                name=family_name,
            )
            db.add(family)
            db.flush()
            print(f"[+] Created Family: {family.name} ({family.id})")
        else:
            print(f"[*] Family exists: {family.name}")

        # 4. Family Members
        members_spec = [
            ("Fatima Bibi", "Head of Household"),
            ("Zainab Bibi", "Daughter"),
            ("Ahmed Khan", "Son"),
        ]
        for name, relationship in members_spec:
            existing_member = db.query(FamilyMember).filter(
                FamilyMember.family_id == family.id,
                FamilyMember.full_name == name,
            ).first()
            if not existing_member:
                member = FamilyMember(
                    id=uuid4(),
                    family_id=family.id,
                    user_id=citizen_user.id if relationship == "Head of Household" else None,
                    full_name=name,
                    relationship=relationship,
                )
                db.add(member)
                print(f"[+] Added Family Member: {name} ({relationship})")

        # 5. Helper Assignment
        assignment = db.query(FamilyAssignment).filter(
            FamilyAssignment.family_id == family.id,
            FamilyAssignment.helper_id == helper_user.id,
            FamilyAssignment.is_active.is_(True),
        ).first()

        if not assignment:
            assignment = FamilyAssignment(
                id=uuid4(),
                family_id=family.id,
                helper_id=helper_user.id,
                assigned_by=officer_user.id,
                is_active=True,
            )
            db.add(assignment)
            db.flush()
            print(f"[+] Assigned Helper {helper_user.full_name} to Family {family.name}")

        # 6. Active Consent
        consent = db.query(Consent).filter(
            Consent.family_id == family.id,
            Consent.recipient_id == helper_user.id,
            Consent.status == "active",
            Consent.withdrawn_at.is_(None),
        ).first()

        if not consent:
            consent = Consent(
                id=uuid4(),
                family_id=family.id,
                granted_by=citizen_user.id,
                recipient_id=helper_user.id,
                purpose="case_support",
                scope="read_write",
                status="active",
            )
            db.add(consent)
            db.flush()
            print(f"[+] Granted Consent from {citizen_user.full_name} to {helper_user.full_name}")

        # 7. Sample Case
        case_title = "Emergency Heating and Nutrition Assistance"
        case = db.query(Case).filter(
            Case.tenant_id == tenant.id,
            Case.title == case_title,
        ).first()

        if not case:
            case = Case(
                id=uuid4(),
                tenant_id=tenant.id,
                family_id=family.id,
                created_by=citizen_user.id,
                assigned_to=helper_user.id,
                title=case_title,
                description="Assistance request for winter heating stipend and nutritional aid for dependents.",
                status="submitted",
            )
            db.add(case)
            db.flush()
            print(f"[+] Created Demo Case: '{case.title}'")

        # 8. RuleSet & Versioned Rules
        rule_set_name = "National Social Protection Cash Assistance"
        rule_set = db.query(RuleSet).filter(
            RuleSet.tenant_id == tenant.id,
            RuleSet.name == rule_set_name,
        ).first()

        if not rule_set:
            rule_set = RuleSet(
                id=uuid4(),
                tenant_id=tenant.id,
                name=rule_set_name,
                description="Official eligibility framework for rural social safety net cash stipends.",
                created_by=officer_user.id,
            )
            db.add(rule_set)
            db.flush()
            print(f"[+] Created RuleSet: {rule_set.name}")

        rule_version = db.query(RuleVersion).filter(
            RuleVersion.rule_set_id == rule_set.id,
            RuleVersion.version == 1,
        ).first()

        criteria = {
            "criteria": [
                {
                    "field": "monthly_income",
                    "operator": "<=",
                    "value": 45000,
                    "description": "Monthly household income must not exceed 45,000 PKR",
                },
                {
                    "field": "household_size",
                    "operator": ">=",
                    "value": 3,
                    "description": "Household size must be at least 3 members",
                },
            ]
        }

        if not rule_version:
            rule_version = RuleVersion(
                id=uuid4(),
                rule_set_id=rule_set.id,
                version=1,
                rules=criteria,
                status="published",
                created_by=officer_user.id,
                published_at=datetime.now(timezone.utc),
            )
            db.add(rule_version)
            db.flush()
            print("[+] Published RuleVersion 1 with deterministic criteria")

        # 9. Baseline Rule Evaluation Snapshot
        evaluation = db.query(RuleEvaluation).filter(
            RuleEvaluation.rule_version_id == rule_version.id,
            RuleEvaluation.case_id == case.id,
        ).first()

        if not evaluation:
            evaluation = RuleEvaluation(
                id=uuid4(),
                rule_version_id=rule_version.id,
                case_id=case.id,
                evaluated_by=officer_user.id,
                input_snapshot={"monthly_income": 32000, "household_size": 3},
                result={
                    "rule_set_id": str(rule_set.id),
                    "rule_version": 1,
                    "criteria_evaluated": 2,
                    "breakdown": [
                        {"field": "monthly_income", "operator": "<=", "expected": 45000, "actual": 32000, "status": "pass"},
                        {"field": "household_size", "operator": ">=", "expected": 3, "actual": 3, "status": "pass"},
                    ],
                },
                missing_fields=[],
                outcome="eligible",
            )
            db.add(evaluation)
            db.flush()
            print("[+] Recorded Baseline RuleEvaluation (outcome: eligible)")

        # 10. Audit Log Record
        audit_entry = AuditLog(
            id=uuid4(),
            tenant_id=tenant.id,
            actor_id=officer_user.id,
            actor_role="officer_admin",
            action="system.seed_completed",
            entity_type="tenant",
            entity_id=tenant.id,
            outcome="success",
            details={"tenant_name": tenant.name, "seed_version": "v1.0"},
            change_summary={"changed_fields": ["seed_version"]},
        )
        db.add(audit_entry)

        db.commit()
        print("=" * 60)
        print("SYNTHETIC DEMO SEEDING COMPLETED SUCCESSFULLY!")
        print("DEMO CREDENTIALS:")
        print("  - Citizen:  citizen@lastmile.local / CitizenPass123!")
        print("  - Helper:   helper@lastmile.local  / HelperPass123!")
        print("  - Officer:  officer@lastmile.local / OfficerPass123!")
        print("=" * 60)

    except Exception as exc:
        db.rollback()
        print(f"[!] Error during seeding: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
