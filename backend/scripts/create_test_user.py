
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.models import Tenant, User


def create_test_user():
    db = SessionLocal()

    try:
        email = "citizen@test.com"

        existing_user = db.query(User).filter(User.email == email).first()

        if existing_user:
            print("Test user already exists.")
            return

        tenant = Tenant(name="Last-Mile Test Organization")
        db.add(tenant)
        db.flush()

        user = User(
            tenant_id=tenant.id,
            email=email,
            full_name="Test Citizen",
            hashed_password=hash_password("TestPassword123!"),
            role="citizen",
            is_active=True,
        )

        db.add(user)
        db.commit()

        print("Test user created successfully!")
        print("Email: citizen@test.com")
        print("Password: TestPassword123!")
        print("Role: citizen")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_test_user()
