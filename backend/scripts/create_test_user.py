from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.models import Tenant, User

def create_test_user():
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.name == "Last-Mile Test Organization").first()
        if not tenant:
            tenant = Tenant(name="Last-Mile Test Organization")
            db.add(tenant)
            db.flush()

        users_to_create = [
            {"email": "citizen@test.com", "name": "Test Citizen", "pass": "TestPassword123!", "role": "citizen"},
            {"email": "helper@test.com", "name": "Test Helper", "pass": "TestPassword123!", "role": "community_helper"},
            {"email": "officer@test.com", "name": "Test Officer", "pass": "TestPassword123!", "role": "officer_admin"}
        ]

        for u in users_to_create:
            existing = db.query(User).filter(User.email == u["email"]).first()
            if not existing:
                new_user = User(
                    tenant_id=tenant.id,
                    email=u["email"],
                    full_name=u["name"],
                    hashed_password=hash_password(u["pass"]),
                    role=u["role"],
                    is_active=True,
                )
                db.add(new_user)
                print(f"Created {u['role']}: {u['email']}")
            else:
                print(f"{u['role']} already exists: {u['email']}")

        db.commit()
        print("Done! Password for all: TestPassword123!")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_test_user()