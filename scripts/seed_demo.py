"""
Repeatable Synthetic Demo Seed Script for Last-Mile Platform.

Provisions synthetic demo tenant, accounts for demo personas,
sample families, family members, helper assignments, active consents,
6 realistic synthetic applications/cases across realistic statuses,
rule sets, published rule versions, baseline evaluations, and audit records.

Execution is strictly idempotent: running multiple times never deletes
records or creates duplicate entries.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Ensure backend directory is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.core.security import hash_password
from app.db.base import Base
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
    print("=" * 65)
    print("STARTING SYNTHETIC DEMO SEEDING FOR LAST-MILE")
    print("=" * 65)

    try:
        # 0. Ensure tables exist (safe no-op if tables are already created)
        Base.metadata.create_all(bind=db.get_bind())

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

        # 2. Users (all personas: citizens, helper, officer admin)
        demo_users_spec = [
            {
                "email": "citizen@lastmile.org",
                "legacy_email": "citizen@lastmile.local",
                "password": "CitizenPass123!",
                "full_name": "Fatima Bibi",
                "role": "citizen",
            },
            {
                "email": "citizen2@lastmile.org",
                "legacy_email": "citizen2@lastmile.local",
                "password": "CitizenPass123!",
                "full_name": "Rashida Begum",
                "role": "citizen",
            },
            {
                "email": "helper@lastmile.org",
                "legacy_email": "helper@lastmile.local",
                "password": "HelperPass123!",
                "full_name": "Ali Hassan",
                "role": "community_helper",
            },
            {
                "email": "officer@lastmile.org",
                "legacy_email": "officer@lastmile.local",
                "password": "OfficerPass123!",
                "full_name": "Dr. Tariq Khan",
                "role": "officer_admin",
            },
        ]

        users = {}
        for spec in demo_users_spec:
            user = db.query(User).filter(User.email == spec["email"]).first()
            if not user and "legacy_email" in spec:
                # Check for legacy .local user and safely migrate email
                legacy_user = db.query(User).filter(User.email == spec["legacy_email"]).first()
                if legacy_user:
                    legacy_user.email = spec["email"]
                    db.flush()
                    user = legacy_user
                    print(f"[*] Migrated legacy User ({spec['role']}): {spec['legacy_email']} -> {spec['email']}")

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
            users[spec["email"]] = user

        citizen_user = users["citizen@lastmile.org"]
        citizen2_user = users["citizen2@lastmile.org"]
        helper_user = users["helper@lastmile.org"]
        officer_user = users["officer@lastmile.org"]

        # 3. Families
        families_spec = [
            {"name": "Bibi Household", "creator": citizen_user},
            {"name": "Begum Household", "creator": citizen2_user},
        ]
        families = {}
        for f_spec in families_spec:
            family = db.query(Family).filter(
                Family.tenant_id == tenant.id,
                Family.name == f_spec["name"],
            ).first()

            if not family:
                family = Family(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    created_by=f_spec["creator"].id,
                    name=f_spec["name"],
                )
                db.add(family)
                db.flush()
                print(f"[+] Created Family: {family.name} ({family.id})")
            else:
                print(f"[*] Family exists: {family.name}")
            families[f_spec["name"]] = family

        bibi_family = families["Bibi Household"]
        begum_family = families["Begum Household"]

        # 4. Family Members
        members_spec = [
            (bibi_family, "Fatima Bibi", "Head of Household", citizen_user.id),
            (bibi_family, "Zainab Bibi", "Daughter", None),
            (bibi_family, "Ahmed Khan", "Son", None),
            (begum_family, "Rashida Begum", "Head of Household", citizen2_user.id),
            (begum_family, "Bilal Ahmed", "Elderly Dependent", None),
        ]
        for fam, name, relationship, uid in members_spec:
            existing_member = db.query(FamilyMember).filter(
                FamilyMember.family_id == fam.id,
                FamilyMember.full_name == name,
            ).first()
            if not existing_member:
                member = FamilyMember(
                    id=uuid4(),
                    family_id=fam.id,
                    user_id=uid,
                    full_name=name,
                    relationship=relationship,
                )
                db.add(member)
                print(f"[+] Added Family Member: {name} ({relationship}) to {fam.name}")
            else:
                print(f"[*] Family Member exists: {name} in {fam.name}")

        # 5. Helper Assignments
        assigned_families = [bibi_family, begum_family]
        for fam in assigned_families:
            assignment = db.query(FamilyAssignment).filter(
                FamilyAssignment.family_id == fam.id,
                FamilyAssignment.helper_id == helper_user.id,
                FamilyAssignment.is_active.is_(True),
            ).first()

            if not assignment:
                assignment = FamilyAssignment(
                    id=uuid4(),
                    family_id=fam.id,
                    helper_id=helper_user.id,
                    assigned_by=officer_user.id,
                    is_active=True,
                )
                db.add(assignment)
                db.flush()
                print(f"[+] Assigned Helper {helper_user.full_name} to Family {fam.name}")
            else:
                print(f"[*] Helper Assignment exists for {helper_user.full_name} -> {fam.name}")

        # 6. Active Consents (read_write scope for helper case assistance)
        consent_specs = [
            {"family": bibi_family, "granter": citizen_user},
            {"family": begum_family, "granter": citizen2_user},
        ]
        for c_spec in consent_specs:
            consent = db.query(Consent).filter(
                Consent.family_id == c_spec["family"].id,
                Consent.recipient_id == helper_user.id,
                Consent.status == "active",
                Consent.withdrawn_at.is_(None),
            ).first()

            if not consent:
                consent = Consent(
                    id=uuid4(),
                    family_id=c_spec["family"].id,
                    granted_by=c_spec["granter"].id,
                    recipient_id=helper_user.id,
                    purpose="case_support",
                    scope="read_write",
                    status="active",
                )
                db.add(consent)
                db.flush()
                print(f"[+] Granted Consent from {c_spec['granter'].full_name} to {helper_user.full_name}")
            else:
                print(f"[*] Active Consent exists for {c_spec['family'].name} -> {helper_user.full_name}")

        # 7. Six Realistic Synthetic Applications/Cases in the Authorized Officer's Queue
        cases_specs = [
            {
                "title": "Emergency Heating and Nutrition Assistance",
                "family": bibi_family,
                "creator": citizen_user,
                "assigned_to": helper_user.id,
                "status": "submitted",
                "description": "Assistance request for winter heating stipend and nutritional aid for dependents.",
            },
            {
                "title": "Child Education Stipend & School Uniform Grant",
                "family": bibi_family,
                "creator": citizen_user,
                "assigned_to": helper_user.id,
                "status": "under_review",
                "description": "Enrollment assistance for secondary school educational stipend and textbook allowance for Zainab Bibi.",
            },
            {
                "title": "Widow Healthcare Support & Chronic Illness Coverage",
                "family": begum_family,
                "creator": citizen2_user,
                "assigned_to": helper_user.id,
                "status": "approved",
                "description": "Subsidy application for monthly prescription medication and subsidized hospital outpatient access.",
            },
            {
                "title": "Elderly Disability Mobility & Living Allowance",
                "family": begum_family,
                "creator": citizen2_user,
                "assigned_to": None,
                "status": "needs_information",
                "description": "Support grant for mobility equipment and caregiver stipend for elderly dependent Bilal Ahmed.",
            },
            {
                "title": "Rural Smallholder Crop Loss Disaster Relief",
                "family": bibi_family,
                "creator": citizen_user,
                "assigned_to": None,
                "status": "submitted",
                "description": "Emergency relief application following unseasonal localized hail damage to subsistence vegetable garden.",
            },
            {
                "title": "Solar Lighting & Clean Water Filtration Subsidy",
                "family": begum_family,
                "creator": citizen2_user,
                "assigned_to": helper_user.id,
                "status": "rejected",
                "description": "Off-grid home solar installation subsidy for peri-urban settlement sector.",
            },
        ]

        seeded_cases = {}
        for c_spec in cases_specs:
            case = db.query(Case).filter(
                Case.tenant_id == tenant.id,
                Case.title == c_spec["title"],
            ).first()

            if not case:
                case = Case(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    family_id=c_spec["family"].id,
                    created_by=c_spec["creator"].id,
                    assigned_to=c_spec["assigned_to"],
                    title=c_spec["title"],
                    description=c_spec["description"],
                    status=c_spec["status"],
                )
                db.add(case)
                db.flush()
                print(f"[+] Created Demo Case [{case.status}]: '{case.title}'")
            else:
                print(f"[*] Demo Case exists [{case.status}]: '{case.title}'")
            seeded_cases[c_spec["title"]] = case

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
        else:
            print(f"[*] RuleSet exists: {rule_set.name}")

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
        else:
            print("[*] Published RuleVersion 1 exists")

        # 9. Baseline Rule Evaluation Snapshots
        primary_case = seeded_cases["Emergency Heating and Nutrition Assistance"]
        evaluation = db.query(RuleEvaluation).filter(
            RuleEvaluation.rule_version_id == rule_version.id,
            RuleEvaluation.case_id == primary_case.id,
        ).first()

        if not evaluation:
            evaluation = RuleEvaluation(
                id=uuid4(),
                rule_version_id=rule_version.id,
                case_id=primary_case.id,
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
        else:
            print("[*] Baseline RuleEvaluation exists")

        # 10. Audit Log Record (Idempotent: checked by action and entity_id)
        existing_audit = db.query(AuditLog).filter(
            AuditLog.tenant_id == tenant.id,
            AuditLog.action == "system.seed_completed",
        ).first()

        if not existing_audit:
            audit_entry = AuditLog(
                id=uuid4(),
                tenant_id=tenant.id,
                actor_id=officer_user.id,
                actor_role="officer_admin",
                action="system.seed_completed",
                entity_type="tenant",
                entity_id=tenant.id,
                outcome="success",
                details={"tenant_name": tenant.name, "seed_version": "v2.0", "cases_seeded": len(cases_specs)},
                change_summary={"changed_fields": ["seed_version", "cases_seeded"]},
            )
            db.add(audit_entry)
            print("[+] Recorded System Seed Audit Log")
        else:
            print("[*] System Seed Audit Log exists")

        db.commit()
        print("=" * 65)
        print("SYNTHETIC DEMO SEEDING COMPLETED SUCCESSFULLY!")
        print("DEMO PERSONAS & CREDENTIALS:")
        print("  - Citizen 1: Fatima Bibi    (citizen@lastmile.org   / CitizenPass123!)")
        print("  - Citizen 2: Rashida Begum  (citizen2@lastmile.org  / CitizenPass123!)")
        print("  - Helper:    Ali Hassan     (helper@lastmile.org    / HelperPass123!)")
        print("  - Officer:   Dr. Tariq Khan (officer@lastmile.org   / OfficerPass123!)")
        print(f"SEEDED CASES ({len(cases_specs)} applications in officer queue):")
        for title, c in seeded_cases.items():
            print(f"  * [{c.status.upper():<17}] {title}")
        print("=" * 65)

    except Exception as exc:
        db.rollback()
        print(f"[!] Error during seeding: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
