"""Tests for CaseBridge real email notification service.

Covers:
1. SMTP configuration and environment variable loading.
2. Low-level send_email_smtp: disabled mode, TLS, SSL, error handling & graceful failure.
3. Complaint registration email dispatch (success & failure paths).
4. Status update email dispatch upon status change events (success & failure paths).
5. Non-status events (e.g. remarks) avoiding unnecessary emails.
6. Email template branding, HTML styling, and plain-text fallback content.
"""

from datetime import date
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Bureau, Case, CaseCategory, CaseStatus, Institution, Priority, Region
from app.permissions import UserPayload
from app.routers.auth import create_token
from app.services.email import (
    SMTPConfig,
    get_smtp_config,
    render_complaint_submission_templates,
    render_status_update_templates,
    send_complaint_submission_notification,
    send_email_smtp,
    send_status_update_notification,
)


def get_token(role: str = "coordinator", bureau: str = None) -> str:
    user = UserPayload(
        role=role,
        name=f"Test {role.title()}",
        username=role,
        bureau=bureau,
    )
    return create_token(user)


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        inst = Institution(
            permanent_id="DEMO-NOTIF-101",
            name="Apex Institute of Technology",
            region=Region.NORTH,
        )
        session.add(inst)
        session.commit()
        session.refresh(inst)

    def get_session_override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = get_session_override
    yield TestClient(app)
    app.dependency_overrides.clear()


# ==============================================================================
# 1. SMTP Configuration Tests
# ==============================================================================


def test_smtp_config_defaults(monkeypatch: pytest.MonkeyPatch):
    """Verify default values when SMTP environment variables are unset."""
    for key in [
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
        "SMTP_FROM_NAME",
        "SMTP_TLS",
        "SMTP_SSL",
        "SMTP_TIMEOUT",
        "FRONTEND_URL",
    ]:
        monkeypatch.delenv(key, raising=False)

    cfg = get_smtp_config()
    assert cfg.host == ""
    assert cfg.port == 587
    assert cfg.from_email == "notifications@casebridge.aicte.gov.in"
    assert cfg.use_tls is True
    assert cfg.use_ssl is False
    assert cfg.timeout == 10
    assert cfg.frontend_url == "http://localhost:5173"


def test_smtp_config_custom_env(monkeypatch: pytest.MonkeyPatch):
    """Verify custom environment variables are properly mapped."""
    monkeypatch.setenv("SMTP_HOST", "smtp.custom-mail.gov.in")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_USERNAME", "mailer_user")
    monkeypatch.setenv("SMTP_PASSWORD", "super_secret_pw")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "helpdesk@aicte.gov.in")
    monkeypatch.setenv("SMTP_FROM_NAME", "AICTE National Grievance Desk")
    monkeypatch.setenv("SMTP_TLS", "false")
    monkeypatch.setenv("SMTP_SSL", "true")
    monkeypatch.setenv("SMTP_TIMEOUT", "15")
    monkeypatch.setenv("FRONTEND_URL", "https://casebridge.aicte.gov.in/")

    cfg = get_smtp_config()
    assert cfg.host == "smtp.custom-mail.gov.in"
    assert cfg.port == 465
    assert cfg.username == "mailer_user"
    assert cfg.password == "super_secret_pw"
    assert cfg.from_email == "helpdesk@aicte.gov.in"
    assert cfg.from_name == "AICTE National Grievance Desk"
    assert cfg.use_tls is False
    assert cfg.use_ssl is True
    assert cfg.timeout == 15
    assert cfg.frontend_url == "https://casebridge.aicte.gov.in"  # trailing slash stripped


# ==============================================================================
# 2. SMTP Delivery Layer Tests (Success & Graceful Failure)
# ==============================================================================


def test_send_email_smtp_disabled_when_host_empty():
    """When SMTP_HOST is empty, delivery should be cleanly skipped returning False."""
    cfg = SMTPConfig(
        host="",
        port=587,
        username="",
        password="",
        from_email="noreply@gov.in",
        from_name="Desk",
        use_tls=True,
        use_ssl=False,
        timeout=5,
        frontend_url="http://localhost:5173",
    )
    result = send_email_smtp("student@test.com", "Test Subject", "<p>Hello</p>", "Hello", config=cfg)
    assert result is False


def test_send_email_smtp_invalid_recipient():
    """Invalid or empty recipient emails should be safely skipped."""
    cfg = SMTPConfig(
        host="smtp.example.com",
        port=587,
        username="",
        password="",
        from_email="noreply@gov.in",
        from_name="Desk",
        use_tls=True,
        use_ssl=False,
        timeout=5,
        frontend_url="http://localhost:5173",
    )
    assert send_email_smtp("", "Sub", "<p>Hi</p>", "Hi", config=cfg) is False
    assert send_email_smtp("invalid-email-no-at", "Sub", "<p>Hi</p>", "Hi", config=cfg) is False


def test_send_email_smtp_success_tls():
    """Verify proper STARTTLS connection and message payload dispatch."""
    cfg = SMTPConfig(
        host="smtp.relay.aicte.gov.in",
        port=587,
        username="smtp_user",
        password="smtp_password",
        from_email="alerts@aicte.gov.in",
        from_name="CaseBridge Alerts",
        use_tls=True,
        use_ssl=False,
        timeout=10,
        frontend_url="http://localhost:5173",
    )

    mock_server = MagicMock()
    with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
        success = send_email_smtp(
            to_email="complainant@example.com",
            subject="Grievance Received",
            html_content="<h1>Registration</h1>",
            text_content="Registration",
            config=cfg,
        )

        assert success is True
        mock_smtp_cls.assert_called_once_with("smtp.relay.aicte.gov.in", 587, timeout=10)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("smtp_user", "smtp_password")
        assert mock_server.send_message.call_count == 1

        sent_msg = mock_server.send_message.call_args[0][0]
        assert sent_msg["Subject"] == "Grievance Received"
        assert sent_msg["To"] == "complainant@example.com"
        assert sent_msg["From"] == "CaseBridge Alerts <alerts@aicte.gov.in>"


def test_send_email_smtp_success_ssl():
    """Verify SSL/TLS port 465 connection dispatch."""
    cfg = SMTPConfig(
        host="smtp.gmail.com",
        port=465,
        username="user@gmail.com",
        password="app_password",
        from_email="user@gmail.com",
        from_name="CaseBridge",
        use_tls=False,
        use_ssl=True,
        timeout=8,
        frontend_url="http://localhost:5173",
    )

    mock_server = MagicMock()
    with patch("smtplib.SMTP_SSL", return_value=mock_server) as mock_smtp_ssl:
        success = send_email_smtp(
            to_email="target@example.com",
            subject="Subject",
            html_content="<p>Body</p>",
            text_content="Body",
            config=cfg,
        )

        assert success is True
        mock_smtp_ssl.assert_called_once_with("smtp.gmail.com", 465, timeout=8)
        mock_server.login.assert_called_once_with("user@gmail.com", "app_password")
        assert mock_server.send_message.call_count == 1


def test_send_email_smtp_failure_is_handled_gracefully():
    """Verify that any SMTP connection or protocol exception is caught and returns False."""
    cfg = SMTPConfig(
        host="smtp.failing-server.com",
        port=587,
        username="u",
        password="p",
        from_email="alerts@gov.in",
        from_name="Alerts",
        use_tls=True,
        use_ssl=False,
        timeout=5,
        frontend_url="http://localhost:5173",
    )

    with patch("smtplib.SMTP", side_effect=Exception("Connection refused or timeout")):
        result = send_email_smtp(
            to_email="someone@example.com",
            subject="Notification",
            html_content="<p>Test</p>",
            text_content="Test",
            config=cfg,
        )
        assert result is False


# ==============================================================================
# 3. API Integration: Complaint Registration Notification
# ==============================================================================


def test_complaint_submission_triggers_email_success(client: TestClient):
    """Creating a case with complainant_email enqueues and dispatches confirmation email."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email_smtp", return_value=True) as mock_send:
        res = client.post(
            "/api/v1/cases",
            headers=headers,
            json={
                "permanent_id": "DEMO-NOTIF-101",
                "bureau": "PGRC",
                "category": "faculty",
                "description": "Shortage of computer science assistant professors.",
                "received_date": str(date.today()),
                "complainant_name": "Rohan Mehra",
                "complainant_email": "rohan.mehra@example.com",
            },
        )

        assert res.status_code == 201
        data = res.json()
        case_no = data["case_no"]
        assert data["complainant_name"] == "Rohan Mehra"
        assert data["complainant_email"] == "rohan.mehra@example.com"

        # Background task runs synchronously in TestClient
        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args[1] if mock_send.call_args[1] else {}
        call_args = mock_send.call_args[0] if mock_send.call_args[0] else ()

        to_email = call_kwargs.get("to_email") or (call_args[0] if len(call_args) > 0 else "")
        subject = call_kwargs.get("subject") or (call_args[1] if len(call_args) > 1 else "")
        html_body = call_kwargs.get("html_content") or (call_args[2] if len(call_args) > 2 else "")
        text_body = call_kwargs.get("text_content") or (call_args[3] if len(call_args) > 3 else "")

        assert to_email == "rohan.mehra@example.com"
        assert case_no in subject
        assert "Complaint Registered" in subject
        assert case_no in html_body
        assert f"/cases/{case_no}" in html_body
        assert "Apex Institute of Technology" in html_body
        assert case_no in text_body
        assert f"/cases/{case_no}" in text_body


def test_complaint_submission_succeeds_even_when_email_fails(client: TestClient):
    """If SMTP delivery raises an unhandled error, complaint registration must still succeed."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email_smtp", side_effect=RuntimeError("SMTP crash")):
        res = client.post(
            "/api/v1/cases",
            headers=headers,
            json={
                "permanent_id": "DEMO-NOTIF-101",
                "bureau": "RB",
                "category": "infrastructure",
                "description": "Library roof leakage and water ingress.",
                "received_date": str(date.today()),
                "complainant_name": "Pooja Sharma",
                "complainant_email": "pooja.sharma@example.com",
            },
        )

        # Crucial requirement: API must return 201 and not fail
        assert res.status_code == 201
        data = res.json()
        assert data["case_no"].startswith("RB-")
        assert data["complainant_email"] == "pooja.sharma@example.com"


def test_complaint_submission_without_email_does_not_dispatch(client: TestClient):
    """Cases created without an email address should not trigger email delivery."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email_smtp") as mock_send:
        res = client.post(
            "/api/v1/cases",
            headers=headers,
            json={
                "permanent_id": "DEMO-NOTIF-101",
                "bureau": "RO",
                "category": "examination",
                "description": "Delayed degree certificate issuance.",
                "received_date": str(date.today()),
            },
        )

        assert res.status_code == 201
        assert mock_send.call_count == 0


# ==============================================================================
# 4. API Integration: Status Update Notification
# ==============================================================================


def test_status_change_triggers_email_success(client: TestClient):
    """Appending a status_change event sends an updated status notification to the complainant."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a case with complainant email
    case_res = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "permanent_id": "DEMO-NOTIF-101",
            "bureau": "PGRC",
            "category": "fee_refund",
            "description": "Tuition fee refund withheld after cancellation.",
            "received_date": str(date.today()),
            "complainant_name": "Amit Roy",
            "complainant_email": "amit.roy@student.ac.in",
        },
    )
    assert case_res.status_code == 201
    case_no = case_res.json()["case_no"]

    # 2. Append a status_change event
    with patch("app.services.email.send_email_smtp", return_value=True) as mock_send:
        event_res = client.post(
            f"/api/v1/cases/{case_no}/events",
            headers=headers,
            json={
                "event_type": "status_change",
                "to_status": "under_process",
                "remarks": "Inquiry notice dispatched to college registrar.",
            },
        )

        assert event_res.status_code == 201
        assert mock_send.call_count == 1

        call_kwargs = mock_send.call_args[1] if mock_send.call_args[1] else {}
        call_args = mock_send.call_args[0] if mock_send.call_args[0] else ()

        to_email = call_kwargs.get("to_email") or (call_args[0] if len(call_args) > 0 else "")
        subject = call_kwargs.get("subject") or (call_args[1] if len(call_args) > 1 else "")
        html_body = call_kwargs.get("html_content") or (call_args[2] if len(call_args) > 2 else "")
        text_body = call_kwargs.get("text_content") or (call_args[3] if len(call_args) > 3 else "")

        assert to_email == "amit.roy@student.ac.in"
        assert case_no in subject
        assert "Under Process" in subject
        assert "Under Process" in html_body
        assert "Inquiry notice dispatched to college registrar." in html_body
        assert f"/cases/{case_no}" in html_body
        assert "Inquiry notice dispatched to college registrar." in text_body


def test_status_change_succeeds_even_when_email_fails(client: TestClient):
    """Status updates must be recorded in the database even if the email service fails."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "permanent_id": "DEMO-NOTIF-101",
            "bureau": "RB",
            "category": "approval",
            "description": "Unauthorized program extension without regulatory nod.",
            "received_date": str(date.today()),
            "complainant_name": "Deepak Sen",
            "complainant_email": "deepak.sen@example.com",
        },
    )
    case_no = case_res.json()["case_no"]

    with patch("app.services.email.send_email_smtp", side_effect=Exception("Network down")):
        event_res = client.post(
            f"/api/v1/cases/{case_no}/events",
            headers=headers,
            json={
                "event_type": "status_change",
                "to_status": "disposed",
                "remarks": "Investigation complete. Case closed with directive.",
            },
        )

        assert event_res.status_code == 201

        # Case status must be updated in DB
        get_res = client.get(f"/api/v1/cases/{case_no}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "disposed"


def test_remark_event_does_not_trigger_status_email(client: TestClient):
    """A remark event that does NOT change the case status should not dispatch a status update email."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "permanent_id": "DEMO-NOTIF-101",
            "bureau": "PGRC",
            "category": "faculty",
            "description": "Faculty qualification verification issue.",
            "received_date": str(date.today()),
            "complainant_email": "informant@example.com",
        },
    )
    case_no = case_res.json()["case_no"]

    with patch("app.services.email.send_email_smtp") as mock_send:
        event_res = client.post(
            f"/api/v1/cases/{case_no}/events",
            headers=headers,
            json={
                "event_type": "remark",
                "remarks": "Internal memo attached for file review.",
            },
        )

        assert event_res.status_code == 201
        assert mock_send.call_count == 0


# ==============================================================================
# 5. Template Rendering & Color Palette Checks
# ==============================================================================


def test_email_templates_content_and_styling():
    """Verify HTML design elements (#1E3A8A navy, Tracking ID, tracking link, fallback)."""
    sub, html_body, text_body = render_complaint_submission_templates(
        case_no="PG-2026-99999",
        complainant_name="Sunil Joshi",
        institution_name="National Engineering College",
        permanent_id="DEMO-2005",
        bureau="PGRC",
        category="fee_refund",
        received_date="2026-10-28",
        description="Demand for excess laboratory fee during final semester.",
        frontend_url="https://casebridge.aicte.gov.in",
    )

    assert "PG-2026-99999" in sub
    assert "#1E3A8A" in html_body  # Brand navy primary
    assert "https://casebridge.aicte.gov.in/cases/PG-2026-99999" in html_body
    assert "Sunil Joshi" in html_body
    assert "National Engineering College" in html_body
    assert "DEMO-2005" in html_body
    assert "https://casebridge.aicte.gov.in/cases/PG-2026-99999" in text_body

    sub2, html_body2, text_body2 = render_status_update_templates(
        case_no="PG-2026-99999",
        complainant_name="Sunil Joshi",
        from_status="pending",
        to_status="under_process",
        remarks="Regulatory notice served to college management.",
        institution_name="National Engineering College",
        action_date="2026-10-28",
        frontend_url="https://casebridge.aicte.gov.in",
    )

    assert "Under Process" in sub2
    assert "#1E3A8A" in html_body2
    assert "Regulatory notice served to college management." in html_body2
    assert "https://casebridge.aicte.gov.in/cases/PG-2026-99999" in html_body2
    assert "Regulatory notice served to college management." in text_body2

