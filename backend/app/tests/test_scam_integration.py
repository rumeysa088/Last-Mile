import io

from app.models.models import AuditLog


def get_token(client, email):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPassword123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_scam_check_suspicious_message_and_audit(client, db_session, test_users):
    token = get_token(client, "citizen@test.com")

    response = client.post(
        "/api/v1/scam/check",
        json={
            "message": "Congratulations! You won BISP cash! Send your bank account and OTP to claim immediately.",
            "language": "en",
        },
        headers=auth_header(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "suspicious"
    assert data["confidence"] >= 0.8
    assert "otp" in data["evidence"] or "bank account" in data["evidence"] or "won" in data["evidence"]
    assert data["model_version"] is not None

    # Verify audit log
    audit_entry = db_session.query(AuditLog).filter(
        AuditLog.action == "scam.checked"
    ).order_by(AuditLog.created_at.desc()).first()
    assert audit_entry is not None
    assert audit_entry.actor_id == test_users["citizen"].id


def test_scam_check_legitimate_message(client, test_users):
    token = get_token(client, "citizen@test.com")

    response = client.post(
        "/api/v1/scam/check",
        json={
            "message": "The public facilitation desk is open Monday to Friday from 9 AM to 5 PM.",
        },
        headers=auth_header(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "likely_legitimate"
    assert data["confidence"] > 0.7


def test_scam_check_ambiguous_short_message(client, test_users):
    token = get_token(client, "citizen@test.com")

    response = client.post(
        "/api/v1/scam/check",
        json={"message": "hello"},
        headers=auth_header(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "unknown"
    assert data["requires_human_review"] is True


def test_voice_stt_endpoint(client, db_session, test_users):
    token = get_token(client, "citizen@test.com")

    dummy_audio = b"RIFF....WAVEfmt ....data...."
    files = {"audio": ("sample.wav", io.BytesIO(dummy_audio), "audio/wav")}

    response = client.post(
        "/api/v1/voice/stt",
        files=files,
        headers=auth_header(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "transcript" in data
    assert data["needs_confirmation"] is True
    assert data["confidence"] > 0.8
