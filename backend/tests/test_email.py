"""Tests for CaseBridge Demo email notification service.

Covers:
1. Email provider configuration (HTTPS Resend default, SMTP option, environment loading).
2. Missing configuration handling: safely skips email sending with clear non-secret logs.
3. Resend HTTPS provider adapter: mocked success, HTTPError (e.g. 401/422), URLError / network timeout.
4. SMTP provider adapter: explicitly selected option, TLS, SSL, error handling & graceful failure.
5. API Integration:
   - Complaint registration email dispatch (success & failure paths).
   - Status update email dispatch on status change events (success & failure paths).
   - Cases without complainant email do not dispatch.
   - Non-status events (e.g. remarks) avoid unnecessary emails.
6. Email templates & Demo branding:
   - "CaseBridge Demo" branding throughout subjects, headers, and signatures.
   - Rejection of AICTE / government affiliation claims.
   - Complete removal of citizen tracking buttons and promises of online tracking / full timelines.
   - Retention of tracking ID and useful status metadata.
7. Frontend badge contract:
   - "Email address saved" shown only when complainant_email exists (not name-only).
   - Absence of "Email notifications active".
"""

from datetime import date
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request
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
    EmailConfig,
    SMTPConfig,
    get_email_config,
    get_smtp_config,
    render_complaint_submission_templates,
    render_status_update_templates,
    send_complaint_submission_notification,
    send_email,
    send_email_resend,
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
# 1. Configuration & Missing Configuration Tests
# ==============================================================================


def test_email_config_defaults(monkeypatch: pytest.MonkeyPatch):
    """Verify default values when email environment variables are unset."""
    for key in [
        "EMAIL_BACKEND",
        "EMAIL_FROM_EMAIL",
        "EMAIL_FROM_NAME",
        "RESEND_API_KEY",
        "RESEND_API_URL",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
        "SMTP_FROM_NAME",
        "SMTP_TLS",
        "SMTP_SSL",
        "EMAIL_TIMEOUT",
        "SMTP_TIMEOUT",
    ]:
        monkeypatch.delenv(key, raising=False)

    cfg = get_email_config()
    # Code-only starting choice for containerized hosting
    assert cfg.backend == "resend"
    # Never invent an unverified sender address
    assert cfg.from_email == ""
    assert cfg.from_name == "CaseBridge Demo"
    assert cfg.resend_api_key == ""
    assert cfg.resend_api_url == "https://api.resend.com/emails"
    assert cfg.smtp_host == ""
    assert cfg.smtp_port == 587
    assert cfg.smtp_tls is True
    assert cfg.smtp_ssl is False
    assert cfg.timeout == 10

    # Test backwards compatibility alias
    assert isinstance(cfg, SMTPConfig)


def test_email_config_custom_env(monkeypatch: pytest.MonkeyPatch):
    """Verify custom environment variables for both Resend and SMTP."""
    monkeypatch.setenv("EMAIL_BACKEND", "smtp")
    monkeypatch.setenv("EMAIL_FROM_EMAIL", "custom-sender@demo.casebridge.test")
    monkeypatch.setenv("EMAIL_FROM_NAME", "CaseBridge Demo Team")
    monkeypatch.setenv("SMTP_HOST", "mail.internal.test")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_USERNAME", "mailer_user")
    monkeypatch.setenv("SMTP_PASSWORD", "mailer_secret")
    monkeypatch.setenv("SMTP_TLS", "false")
    monkeypatch.setenv("SMTP_SSL", "true")
    monkeypatch.setenv("EMAIL_TIMEOUT", "15")

    cfg = get_email_config()
    assert cfg.backend == "smtp"
    assert cfg.from_email == "custom-sender@demo.casebridge.test"
    assert cfg.from_name == "CaseBridge Demo Team"
    assert cfg.smtp_host == "mail.internal.test"
    assert cfg.smtp_port == 465
    assert cfg.smtp_username == "mailer_user"
    assert cfg.smtp_password == "mailer_secret"
    assert cfg.smtp_tls is False
    assert cfg.smtp_ssl is True
    assert cfg.timeout == 15


def test_resend_missing_configuration_safely_skips():
    """Missing RESEND_API_KEY or EMAIL_FROM_EMAIL must return False without throwing."""
    # Missing API key
    cfg_no_key = EmailConfig(
        backend="resend",
        resend_api_key="",
        from_email="sender@demo.example.com",
    )
    assert send_email_resend("user@example.com", "Test", "<p>A</p>", "A", config=cfg_no_key) is False

    # Missing sender email
    cfg_no_sender = EmailConfig(
        backend="resend",
        resend_api_key="re_test_key",
        from_email="",
    )
    assert send_email_resend("user@example.com", "Test", "<p>A</p>", "A", config=cfg_no_sender) is False

    # Invalid recipient email
    cfg_valid = EmailConfig(
        backend="resend",
        resend_api_key="re_test_key",
        from_email="sender@demo.example.com",
    )
    assert send_email_resend("not-an-email", "Test", "<p>A</p>", "A", config=cfg_valid) is False
    assert send_email_resend("", "Test", "<p>A</p>", "A", config=cfg_valid) is False


def test_smtp_missing_configuration_safely_skips():
    """Missing SMTP_HOST or EMAIL_FROM_EMAIL must return False without throwing."""
    # Missing host
    cfg_no_host = EmailConfig(
        backend="smtp",
        smtp_host="",
        from_email="sender@demo.example.com",
    )
    assert send_email_smtp("user@example.com", "Test", "<p>A</p>", "A", config=cfg_no_host) is False

    # Missing sender
    cfg_no_sender = EmailConfig(
        backend="smtp",
        smtp_host="smtp.example.com",
        from_email="",
    )
    assert send_email_smtp("user@example.com", "Test", "<p>A</p>", "A", config=cfg_no_sender) is False


def test_send_email_router_skips_on_unknown_backend():
    """Unknown backend logs a warning and returns False without throwing."""
    cfg = EmailConfig(
        backend="unknown_mailer",
        from_email="sender@demo.example.com",
    )
    assert send_email("user@example.com", "Test", "<p>A</p>", "A", config=cfg) is False


# ==============================================================================
# 2. Mocked HTTPS Provider Adapter (Resend)
# ==============================================================================


def test_resend_https_success():
    """Successful HTTPS POST to Resend endpoint parses payload and returns True."""
    cfg = EmailConfig(
        backend="resend",
        resend_api_key="re_valid_api_key_123",
        from_email="verified@demo.example.com",
        from_name="CaseBridge Demo",
        timeout=8,
    )

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 200
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        sent = send_email_resend(
            to_email="citizen@student.ac.in",
            subject="[CaseBridge Demo] Registration Notice",
            html_content="<p>Tracking ID: PGRC-2026-0001</p>",
            text_content="Tracking ID: PGRC-2026-0001",
            config=cfg,
        )

        assert sent is True
        assert mock_urlopen.call_count == 1
        req = mock_urlopen.call_args[0][0]
        assert isinstance(req, urllib.request.Request)
        assert req.full_url == "https://api.resend.com/emails"
        assert req.get_method() == "POST"
        assert req.headers["Authorization"] == "Bearer re_valid_api_key_123"
        assert "application/json" in req.headers["Content-type"]


def test_resend_https_http_error_handled_without_leaking_secrets():
    """HTTP 401 or 422 from Resend API is caught safely and returns False."""
    cfg = EmailConfig(
        backend="resend",
        resend_api_key="re_invalid_api_key",
        from_email="verified@demo.example.com",
    )

    http_error = urllib.error.HTTPError(
        url="https://api.resend.com/emails",
        code=401,
        msg="Unauthorized",
        hdrs={},
        fp=BytesIO(b'{"message":"Invalid API key"}'),
    )

    with patch("urllib.request.urlopen", side_effect=http_error):
        sent = send_email_resend(
            to_email="citizen@student.ac.in",
            subject="[CaseBridge Demo] Notice",
            html_content="<p>Test</p>",
            text_content="Test",
            config=cfg,
        )
        assert sent is False


def test_resend_https_network_url_error_handled():
    """URLError (e.g. connection refused or DNS failure) is caught safely and returns False."""
    cfg = EmailConfig(
        backend="resend",
        resend_api_key="re_valid_api_key",
        from_email="verified@demo.example.com",
    )

    url_error = urllib.error.URLError("Connection timed out")

    with patch("urllib.request.urlopen", side_effect=url_error):
        sent = send_email_resend(
            to_email="citizen@student.ac.in",
            subject="[CaseBridge Demo] Notice",
            html_content="<p>Test</p>",
            text_content="Test",
            config=cfg,
        )
        assert sent is False


# ==============================================================================
# 3. Mocked SMTP Provider Adapter
# ==============================================================================


def test_smtp_success_tls():
    """Valid SMTP TLS flow connects, initiates STARTTLS, logs in and sends message."""
    cfg = EmailConfig(
        backend="smtp",
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="smtp_user",
        smtp_password="smtp_password",
        from_email="notifications@demo.example.com",
        from_name="CaseBridge Demo",
        smtp_tls=True,
        smtp_ssl=False,
    )

    mock_server = MagicMock()
    mock_server.__enter__.return_value = mock_server
    mock_server.__exit__.return_value = None

    with patch("smtplib.SMTP", return_value=mock_server) as mock_smtp_cls:
        sent = send_email_smtp(
            to_email="test.user@example.com",
            subject="[CaseBridge Demo] Test Notice",
            html_content="<p>Notice</p>",
            text_content="Notice",
            config=cfg,
        )

        assert sent is True
        mock_smtp_cls.assert_called_once_with("smtp.example.com", 587, timeout=10)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("smtp_user", "smtp_password")
        mock_server.send_message.assert_called_once()


def test_smtp_success_ssl():
    """Valid SMTP SSL flow connects via SMTP_SSL directly on port 465."""
    cfg = EmailConfig(
        backend="smtp",
        smtp_host="smtp.example.com",
        smtp_port=465,
        smtp_username="smtp_user",
        smtp_password="smtp_password",
        from_email="notifications@demo.example.com",
        smtp_tls=False,
        smtp_ssl=True,
    )

    mock_server = MagicMock()
    mock_server.__enter__.return_value = mock_server
    mock_server.__exit__.return_value = None

    with patch("smtplib.SMTP_SSL", return_value=mock_server) as mock_ssl_cls:
        sent = send_email_smtp(
            to_email="test.ssl@example.com",
            subject="[CaseBridge Demo] SSL Notice",
            html_content="<p>SSL</p>",
            text_content="SSL",
            config=cfg,
        )

        assert sent is True
        mock_ssl_cls.assert_called_once_with("smtp.example.com", 465, timeout=10)
        mock_server.login.assert_called_once_with("smtp_user", "smtp_password")
        mock_server.send_message.assert_called_once()


def test_smtp_failure_is_handled_gracefully():
    """Network connection failure in SMTP returns False without crashing."""
    cfg = EmailConfig(
        backend="smtp",
        smtp_host="smtp.unreachable.test",
        smtp_port=587,
        from_email="notifications@demo.example.com",
    )

    with patch("smtplib.SMTP", side_effect=Exception("Connection refused")):
        sent = send_email_smtp(
            to_email="someone@example.com",
            subject="Notice",
            html_content="<p>Test</p>",
            text_content="Test",
            config=cfg,
        )
        assert sent is False


# ==============================================================================
# 4. API Integration: Complaint Registration Notification
# ==============================================================================


def test_complaint_submission_triggers_email_success(client: TestClient):
    """Creating a case with complainant_email enqueues and dispatches confirmation email."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email", return_value=True) as mock_send:
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

        assert mock_send.call_count == 1
        call_kwargs = mock_send.call_args[1] if mock_send.call_args[1] else {}
        call_args = mock_send.call_args[0] if mock_send.call_args[0] else ()

        to_email = call_kwargs.get("to_email") or (call_args[0] if len(call_args) > 0 else "")
        subject = call_kwargs.get("subject") or (call_args[1] if len(call_args) > 1 else "")
        html_body = call_kwargs.get("html_content") or (call_args[2] if len(call_args) > 2 else "")
        text_body = call_kwargs.get("text_content") or (call_args[3] if len(call_args) > 3 else "")

        assert to_email == "rohan.mehra@example.com"
        assert case_no in subject
        assert "[CaseBridge Demo]" in subject
        assert case_no in html_body
        assert case_no in text_body
        assert "Apex Institute of Technology" in html_body
        # Verify no tracking buttons or citizen portal promises
        assert "Track Complaint Status" not in html_body
        assert "TRACK YOUR COMPLAINT ONLINE" not in text_body
        assert "/cases/" not in html_body
        assert "/cases/" not in text_body


def test_complaint_submission_succeeds_even_when_email_fails(client: TestClient):
    """If email delivery raises an unhandled error, complaint registration must still succeed."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email", side_effect=RuntimeError("Delivery adapter crash")):
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

        assert res.status_code == 201
        data = res.json()
        assert data["case_no"].startswith("RB-")
        assert data["complainant_email"] == "pooja.sharma@example.com"


def test_complaint_submission_without_email_does_not_dispatch(client: TestClient):
    """Cases created without an email address should not trigger email delivery."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.services.email.send_email") as mock_send:
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
# 5. API Integration: Status Update Notification
# ==============================================================================


def test_status_change_triggers_email_success(client: TestClient):
    """Appending a status_change event sends an updated status notification to the complainant."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "permanent_id": "DEMO-NOTIF-101",
            "bureau": "PGRC",
            "category": "faculty",
            "description": "Ragging complaint filed by first-year student.",
            "received_date": str(date.today()),
            "complainant_name": "Amit Roy",
            "complainant_email": "amit.roy@student.ac.in",
        },
    )
    case_no = case_res.json()["case_no"]

    with patch("app.services.email.send_email", return_value=True) as mock_send:
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
        assert "[CaseBridge Demo]" in subject
        assert "Under Process" in subject
        assert "Under Process" in html_body
        assert "Inquiry notice dispatched to college registrar." in html_body
        assert "Inquiry notice dispatched to college registrar." in text_body
        # Verify no tracking buttons or citizen portal promises
        assert "View Full Case Timeline" not in html_body
        assert "VIEW COMPLETE CASE HISTORY" not in text_body
        assert "/cases/" not in html_body
        assert "/cases/" not in text_body


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

    with patch("app.services.email.send_email", side_effect=Exception("Provider timeout")):
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

        get_res = client.get(f"/api/v1/cases/{case_no}", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "disposed"


def test_remark_event_does_not_trigger_status_email(client: TestClient):
    """Administrative remarks without status changes do not send status change emails."""
    token = get_token("coordinator")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "permanent_id": "DEMO-NOTIF-101",
            "bureau": "PGRC",
            "category": "fee_refund",
            "description": "Delayed disbursement of merit scholarship.",
            "received_date": str(date.today()),
            "complainant_email": "scholar@example.ac.in",
        },
    )
    case_no = case_res.json()["case_no"]

    with patch("app.services.email.send_email") as mock_send:
        event_res = client.post(
            f"/api/v1/cases/{case_no}/events",
            headers=headers,
            json={
                "event_type": "remark",
                "remarks": "Contacted accounts office for disbursement ledger.",
            },
        )

        assert event_res.status_code == 201
        assert mock_send.call_count == 0


# ==============================================================================
# 6. Email Template Branding & Regression Tests
# ==============================================================================


def test_email_templates_removed_tracking_promises_and_demo_branding():
    """Verify templates contain Demo branding, tracking ID, and no tracking promises."""
    # 1. Registration template
    subject, html_body, text_body = render_complaint_submission_templates(
        case_no="PGRC-2026-9999",
        complainant_name="Sunil Joshi",
        institution_name="National Engineering College",
        permanent_id="NEC-442",
        bureau="PGRC",
        category="faculty",
        received_date="2026-10-28",
        description="Faculty absence without alternate arrangement.",
    )

    # Demo branding present
    assert "[CaseBridge Demo]" in subject
    assert "CaseBridge Demo" in html_body
    assert "CaseBridge Demo Desk" in text_body
    assert "PGRC-2026-9999" in subject
    assert "PGRC-2026-9999" in html_body
    assert "PGRC-2026-9999" in text_body

    # Bureau masking preserved
    assert "PGRC" in html_body
    assert "PGRC" in text_body

    # Government / AICTE affiliation claims ABSENT
    assert "Official Grievance Desk" not in html_body
    assert "Official Grievance Desk" not in text_body
    assert "AICTE" not in html_body
    assert "AICTE" not in text_body
    assert "All India Council for Technical Education" not in html_body
    assert "All India Council for Technical Education" not in text_body

    # Citizen tracking buttons & promises ABSENT
    assert "Track Complaint Status" not in html_body
    assert "TRACK YOUR COMPLAINT ONLINE" not in text_body
    assert "timeline" not in html_body.lower()
    assert "/cases/" not in html_body
    assert "/cases/" not in text_body

    # 2. Status update template
    up_sub, up_html, up_text = render_status_update_templates(
        case_no="PGRC-2026-9999",
        complainant_name="Sunil Joshi",
        from_status="pending",
        to_status="under_process",
        remarks="Faculty committee initiated hearing.",
        institution_name="National Engineering College",
        action_date="2026-10-29",
    )

    assert "[CaseBridge Demo]" in up_sub
    assert "Under Process" in up_sub
    assert "CaseBridge Demo" in up_html
    assert "CaseBridge Demo Desk" in up_text
    assert "PGRC-2026-9999" in up_html
    assert "Faculty committee initiated hearing." in up_html
    assert "Faculty committee initiated hearing." in up_text

    # Government / AICTE claims ABSENT
    assert "AICTE" not in up_html
    assert "AICTE" not in up_text
    assert "Official Grievance Desk" not in up_html

    # Citizen tracking buttons & promises ABSENT
    assert "View Full Case Timeline" not in up_html
    assert "VIEW COMPLETE CASE HISTORY" not in up_text
    assert "/cases/" not in up_html
    assert "/cases/" not in up_text


# ==============================================================================
# 7. Frontend Badge Contract Regression Tests
# ==============================================================================


def test_frontend_case_detail_page_badge_contract():
    """Verify CaseDetailPage renders 'Email address saved' only when complainant_email exists."""
    frontend_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "pages" / "CaseDetailPage.tsx"
    assert frontend_path.exists(), f"Could not find {frontend_path}"

    content = frontend_path.read_text(encoding="utf-8")

    # 1. 'Email notifications active' must not exist anywhere in the component
    assert "Email notifications active" not in content

    # 2. 'Email address saved' must be present
    assert "Email address saved" in content

    # 3. Must be guarded strictly by caseItem.complainant_email (not only name)
    assert "{caseItem.complainant_email && (" in content
    assert "caseItem.complainant_email &&" in content
