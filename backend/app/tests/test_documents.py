import io
from uuid import UUID

from app.core.security import hash_password
from app.models.family_assignment import FamilyAssignment
from app.models.models import AuditLog, Case, Consent, Family, Tenant, User


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def setup_case(db_session, users):
    family = Family(
        tenant_id=users["tenant"].id,
        created_by=users["citizen"].id,
        name="Doc Test Family",
    )
    db_session.add(family)
    db_session.flush()

    case = Case(
        tenant_id=users["tenant"].id,
        family_id=family.id,
        created_by=users["citizen"].id,
        title="Doc Test Case",
        description="Documents attached",
        status="submitted",
    )
    db_session.add(case)
    db_session.commit()

    return family, case


def test_authorized_document_upload_download_and_audit(client, db_session, test_users):
    family, case = setup_case(db_session, test_users)
    token = get_token(client, "citizen@test.com")

    # Valid PDF magic bytes: %PDF-1.4
    pdf_content = b"%PDF-1.4 valid pdf file stream test"
    files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}

    upload_resp = client.post(
        f"/api/v1/cases/{case.id}/documents",
        files=files,
        headers=auth_header(token),
    )
    assert upload_resp.status_code == 201
    doc_id = upload_resp.json()["id"]

    # Download document
    download_resp = client.get(
        f"/api/v1/cases/{case.id}/documents/{doc_id}/download",
        headers=auth_header(token),
    )
    assert download_resp.status_code == 200
    assert download_resp.content == pdf_content

    # Verify download audit log
    audit_download = db_session.query(AuditLog).filter(
        AuditLog.entity_id == UUID(doc_id),
        AuditLog.action == "document.downloaded",
    ).first()
    assert audit_download is not None
    assert audit_download.actor_id == test_users["citizen"].id


def test_helper_with_consent_can_upload_document(client, db_session, test_users):
    family, case = setup_case(db_session, test_users)

    # Assign helper and grant active consent
    db_session.add_all([
        FamilyAssignment(family_id=family.id, helper_id=test_users["helper"].id, assigned_by=test_users["citizen"].id, is_active=True),
        Consent(family_id=family.id, granted_by=test_users["citizen"].id, recipient_id=test_users["helper"].id, scope="read_write", status="active"),
    ])
    db_session.commit()

    helper_token = get_token(client, "helper@test.com")

    # Valid JPEG magic bytes: \xff\xd8\xff
    jpeg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"dummy jpeg data"
    files = {"file": ("id_card.jpg", io.BytesIO(jpeg_content), "image/jpeg")}

    resp = client.post(
        f"/api/v1/cases/{case.id}/documents",
        files=files,
        headers=auth_header(helper_token),
    )
    assert resp.status_code == 201
    assert resp.json()["filename"] == "id_card.jpg"


def test_invalid_file_content_signature_rejected(client, db_session, test_users):
    family, case = setup_case(db_session, test_users)
    token = get_token(client, "citizen@test.com")

    # Spoofed content: claims to be PDF but contains shell script
    spoofed_content = b"#!/bin/bash\necho 'malicious'"
    files = {"file": ("exploit.pdf", io.BytesIO(spoofed_content), "application/pdf")}

    resp = client.post(
        f"/api/v1/cases/{case.id}/documents",
        files=files,
        headers=auth_header(token),
    )
    assert resp.status_code == 415
    assert "File content does not match allowed types" in resp.json()["detail"]


def test_cross_tenant_document_download_denied(client, db_session, test_users):
    family, case = setup_case(db_session, test_users)
    token = get_token(client, "citizen@test.com")

    pdf_content = b"%PDF-1.4 test document"
    files = {"file": ("secret.pdf", io.BytesIO(pdf_content), "application/pdf")}
    upload_resp = client.post(
        f"/api/v1/cases/{case.id}/documents",
        files=files,
        headers=auth_header(token),
    )
    assert upload_resp.status_code == 201
    doc_id = upload_resp.json()["id"]

    # Create user from another tenant
    other_tenant = Tenant(name="Tenant B")
    db_session.add(other_tenant)
    db_session.flush()

    other_user = User(
        tenant_id=other_tenant.id,
        email="tenant_b_user@test.com",
        full_name="Tenant B User",
        hashed_password=hash_password("TestPassword123!"),
        role="citizen",
        is_active=True,
    )
    db_session.add(other_user)
    db_session.commit()

    other_token = get_token(client, "tenant_b_user@test.com")

    resp = client.get(
        f"/api/v1/cases/{case.id}/documents/{doc_id}/download",
        headers=auth_header(other_token),
    )
    assert resp.status_code == 404
