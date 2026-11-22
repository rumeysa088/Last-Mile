"""Demo data for the judges' walkthrough. Synthetic people only. Safe to run more than once.

Run AFTER scripts/create_test_user.py:
    python scripts/seed_demo.py

Creates:
  - display names for the three test users (Zainab Bibi / Rukhsana Baloch / Demo Officer)
  - Zainab's own family (owned by citizen@test.com), shared with the helper
  - helper families with active consent + assignment, including deliberate look-alike
    names (Muhammad/Mohammad Aslam Ansari, Ayesha/Aisha Bibi) that must NOT be merged
  - a published eligibility rule set "BISP-2026" v1 (monthly income <= 50,000 PKR)
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.family_assignment import FamilyAssignment  # noqa: E402
from app.models.models import Consent, Family, RuleSet, RuleVersion, User  # noqa: E402

HELPER_FAMILIES = [
    "Ayesha Bibi", "Aisha Bibi", "Muhammad Aslam Ansari", "Mohammad Aslam Ansari",
    "Shabana Khatoon", "Ghulam Nabi Solangi", "Nasreen Memon", "Abdul Rauf Baloch",
    "Kulsoom Shaikh", "Rashid Qureshi", "Parveen Ansari", "Yousuf Bibi",
]

RULES = {
    "program_code": "BISP-2026",
    "criteria": [
        {"field": "monthly_income_pkr", "operator": "<=", "value": 50000},
        {"field": "household_size", "operator": ">=", "value": 1},
    ],
}


def now():
    return datetime.now(timezone.utc)


def main():
    db = SessionLocal()
    try:
        users = {u.email: u for u in db.query(User).filter(User.email.in_(["citizen@test.com", "helper@test.com", "officer@test.com"])).all()}
        if len(users) < 3:
            print("Run scripts/create_test_user.py first.")
            return
        citizen, helper, officer = users["citizen@test.com"], users["helper@test.com"], users["officer@test.com"]
        citizen.full_name, helper.full_name, officer.full_name = "Zainab Bibi", "Rukhsana Baloch", "Demo Officer"
        tenant_id = citizen.tenant_id

        def ensure_family(name, owner):
            fam = db.query(Family).filter(Family.tenant_id == tenant_id, Family.name == name, Family.created_by == owner.id).first()
            if not fam:
                fam = Family(tenant_id=tenant_id, created_by=owner.id, name=name)
                db.add(fam)
                db.flush()
            return fam

        def ensure_share(fam, granted_by):
            if not db.query(Consent).filter(Consent.family_id == fam.id, Consent.recipient_id == helper.id).first():
                db.add(Consent(family_id=fam.id, granted_by=granted_by.id, recipient_id=helper.id,
                               purpose="Help with relief application", scope="read_write", status="active", granted_at=now()))
            if not db.query(FamilyAssignment).filter(FamilyAssignment.family_id == fam.id, FamilyAssignment.helper_id == helper.id,
                                                     FamilyAssignment.is_active.is_(True)).first():
                db.add(FamilyAssignment(family_id=fam.id, helper_id=helper.id, assigned_by=officer.id, is_active=True))

        ensure_share(ensure_family("Zainab Bibi", citizen), citizen)
        for name in HELPER_FAMILIES:
            ensure_share(ensure_family(name, officer), officer)

        rs = db.query(RuleSet).filter(RuleSet.name == "BISP-2026").first()
        if not rs:
            rs = RuleSet(tenant_id=tenant_id, name="BISP-2026", description="Relief eligibility (demo)", created_by=officer.id)
            db.add(rs)
            db.flush()
        if not db.query(RuleVersion).filter(RuleVersion.rule_set_id == rs.id, RuleVersion.status == "published").first():
            db.add(RuleVersion(rule_set_id=rs.id, version=1, rules=RULES, status="published", created_by=officer.id, published_at=now()))

        db.commit()
        print(f"Seeded: Zainab's family + {len(HELPER_FAMILIES)} helper families, rule set BISP-2026 v1 published.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
