"""Email notification service for CaseBridge Demo (SIH26264).

Provides asynchronous, non-blocking demonstration email delivery for:
1. Complaint registration notice to complainant with tracking ID and status details.
2. Status change notifications to complainant with updated status, remarks, and metadata.

Architecture & Delivery Routes:
- HTTPS Provider Adapter ('resend', default): Works on platforms like Render Free where
  outbound SMTP ports (25, 465, 587) are blocked at the network level. Sends requests
  over standard outbound HTTPS (port 443) to Resend's REST API.
- SMTP Adapter ('smtp'): Kept as an explicitly selected option for compatible hosting environments.

Operational Guarantees:
- Never blocks or faults API callers: All email tasks execute in FastAPI BackgroundTasks
  and fail softly with safe, sanitized logging.
- Missing configuration (unset keys, unconfigured sender) safely skips email delivery
  with a clear, non-secret informational log notice.
- Never logs API keys, SMTP credentials, or sensitive grievance bodies.
"""

from __future__ import annotations

import html
import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class EmailConfig:
    """Unified email configuration for HTTPS and SMTP provider adapters."""

    backend: str = "resend"  # "resend" or "smtp"
    from_email: str = ""
    from_name: str = "CaseBridge Demo"
    timeout: int = 10

    # Resend HTTPS settings
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com/emails"

    # SMTP settings
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True
    smtp_ssl: bool = False

    # Backwards-compatibility properties matching previous SMTPConfig interface
    @property
    def host(self) -> str:
        return self.smtp_host

    @property
    def port(self) -> int:
        return self.smtp_port

    @property
    def username(self) -> str:
        return self.smtp_username

    @property
    def password(self) -> str:
        return self.smtp_password

    @property
    def use_tls(self) -> bool:
        return self.smtp_tls

    @property
    def use_ssl(self) -> bool:
        return self.smtp_ssl

    @property
    def frontend_url(self) -> str:
        return ""


# Backward compatibility alias
SMTPConfig = EmailConfig


def get_email_config() -> EmailConfig:
    """Load email configuration dynamically from environment variables."""
    backend = os.getenv("EMAIL_BACKEND", "").strip().lower()
    if not backend:
        # Code-only starting choice for containerized environments with blocked SMTP
        backend = "resend"

    # Require an explicitly configured sender address; never invent an unverified one
    from_email = (
        os.getenv("EMAIL_FROM_EMAIL")
        or os.getenv("RESEND_FROM_EMAIL")
        or os.getenv("SMTP_FROM_EMAIL")
        or ""
    ).strip()

    from_name = (
        os.getenv("EMAIL_FROM_NAME")
        or os.getenv("SMTP_FROM_NAME")
        or "CaseBridge Demo"
    ).strip()

    resend_api_key = os.getenv("RESEND_API_KEY", "").strip()
    resend_api_url = os.getenv("RESEND_API_URL", "https://api.resend.com/emails").strip()

    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port_val = os.getenv("SMTP_PORT", "587").strip()
    try:
        smtp_port = int(smtp_port_val)
    except ValueError:
        smtp_port = 587

    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_tls = os.getenv("SMTP_TLS", "true").lower() in ("true", "1", "yes")
    smtp_ssl = os.getenv("SMTP_SSL", "false").lower() in ("true", "1", "yes")

    timeout_val = os.getenv("EMAIL_TIMEOUT") or os.getenv("SMTP_TIMEOUT") or "10"
    try:
        timeout = int(timeout_val.strip())
    except ValueError:
        timeout = 10

    return EmailConfig(
        backend=backend,
        from_email=from_email,
        from_name=from_name,
        timeout=timeout,
        resend_api_key=resend_api_key,
        resend_api_url=resend_api_url,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_username=smtp_username,
        smtp_password=smtp_password,
        smtp_tls=smtp_tls,
        smtp_ssl=smtp_ssl,
    )


# Backward compatibility alias
get_smtp_config = get_email_config


def send_email_resend(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    config: Optional[EmailConfig] = None,
) -> bool:
    """Send an email using Resend's HTTPS REST API.

    Designed for environments like Render Free where outbound SMTP ports (25, 465, 587)
    are blocked. Makes a standard outbound HTTPS POST request to api.resend.com/emails.

    Catches and logs all errors safely; never logs API keys or sensitive bodies.
    Returns True if sent successfully, False otherwise.
    """
    if config is None:
        config = get_email_config()

    if not config.resend_api_key:
        logger.info(
            "Resend HTTPS email delivery skipped: RESEND_API_KEY is not configured"
        )
        return False

    if not config.from_email:
        logger.info(
            "Resend HTTPS email delivery skipped: sender email address is not configured (set EMAIL_FROM_EMAIL)"
        )
        return False

    if not to_email or "@" not in to_email:
        logger.warning(
            "Recipient email '%s' is empty or invalid; skipping email delivery",
            to_email,
        )
        return False

    sender_header = (
        f"{config.from_name} <{config.from_email}>"
        if config.from_name
        else config.from_email
    )

    payload = {
        "from": sender_header,
        "to": [to_email.strip()],
        "subject": subject,
        "html": html_content,
        "text": text_content,
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        config.resend_api_url,
        data=req_data,
        headers={
            "Authorization": f"Bearer {config.resend_api_key}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "CaseBridge-Demo/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=config.timeout) as resp:
            status_code = resp.getcode()
            if 200 <= status_code < 300:
                logger.info(
                    "Successfully dispatched email via Resend to %s (subject: %s)",
                    to_email,
                    subject,
                )
                return True
            else:
                logger.error(
                    "Resend HTTPS delivery to %s returned unexpected HTTP status %s",
                    to_email,
                    status_code,
                )
                return False
    except urllib.error.HTTPError as exc:
        logger.error(
            "Resend HTTPS delivery failed to %s for subject '%s': HTTP %s",
            to_email,
            subject,
            exc.code,
        )
        return False
    except urllib.error.URLError as exc:
        logger.error(
            "Resend HTTPS network error to %s: %s",
            to_email,
            exc.reason,
        )
        return False
    except Exception as exc:
        logger.error(
            "Unexpected error delivering email via Resend to %s: %s",
            to_email,
            type(exc).__name__,
        )
        return False


def send_email_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    config: Optional[EmailConfig] = None,
) -> bool:
    """Send a multipart HTML + plain-text email via standard SMTP.

    Used when EMAIL_BACKEND=smtp on hosting platforms that permit outbound SMTP traffic.
    Catches and logs all errors safely; never logs passwords or sensitive bodies.
    Returns True if sent successfully, False otherwise.
    """
    if config is None:
        config = get_email_config()

    if not config.smtp_host:
        logger.info(
            "SMTP email delivery skipped: SMTP_HOST is not configured"
        )
        return False

    if not config.from_email:
        logger.info(
            "SMTP email delivery skipped: sender email address is not configured (set EMAIL_FROM_EMAIL)"
        )
        return False

    if not to_email or "@" not in to_email:
        logger.warning(
            "Recipient email '%s' is empty or invalid; skipping email delivery",
            to_email,
        )
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["To"] = to_email
        if config.from_name:
            msg["From"] = f"{config.from_name} <{config.from_email}>"
        else:
            msg["From"] = config.from_email

        part_text = MIMEText(text_content, "plain", "utf-8")
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)

        if config.smtp_ssl:
            server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=config.timeout)
        else:
            server = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=config.timeout)

        with server:
            if not config.smtp_ssl and config.smtp_tls:
                server.starttls()
            if config.smtp_username and config.smtp_password:
                server.login(config.smtp_username, config.smtp_password)
            server.send_message(msg)

        logger.info("Successfully dispatched email via SMTP to %s (subject: %s)", to_email, subject)
        return True

    except Exception as exc:
        logger.error(
            "SMTP delivery failed to %s for subject '%s': %s",
            to_email,
            subject,
            type(exc).__name__,
        )
        return False


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    config: Optional[EmailConfig] = None,
) -> bool:
    """Route email delivery to the configured backend provider (resend or smtp)."""
    if config is None:
        config = get_email_config()

    backend = (config.backend or "resend").lower()
    if backend == "resend":
        return send_email_resend(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            config=config,
        )
    elif backend == "smtp":
        return send_email_smtp(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            config=config,
        )
    else:
        logger.warning(
            "Unknown EMAIL_BACKEND '%s'; safely skipping email delivery to %s",
            config.backend,
            to_email,
        )
        return False


def _get_status_badge_style(status_val: str) -> tuple[str, str]:
    """Return background and text color hex codes for status chip styling."""
    norm = status_val.lower().replace(" ", "_")
    if norm == "pending":
        return "#FEF3C7", "#78350F"  # Amber
    elif norm == "under_process":
        return "#E0F2FE", "#0369A1"  # Sky
    elif norm == "disposed":
        return "#D1FAE5", "#065F46"  # Emerald
    elif norm == "transferred":
        return "#EDE9FE", "#5B21B6"  # Violet
    elif norm == "escalated":
        return "#FFE4E6", "#9F1239"  # Rose
    return "#F1F5F9", "#334155"  # Slate


def render_complaint_submission_templates(
    case_no: str,
    complainant_name: str,
    institution_name: str,
    permanent_id: str,
    bureau: str,
    category: str,
    received_date: str,
    description: str,
    frontend_url: str = "",
) -> tuple[str, str, str]:
    """Generate subject, HTML body, and plain-text fallback for complaint registration.

    Contains tracking ID, institution details, and division metadata.
    Does not promise public online tracking or expose timelines.
    """
    safe_name = html.escape(complainant_name or "Complainant")
    safe_case_no = html.escape(case_no)
    safe_inst_name = html.escape(institution_name or "Educational Institution")
    safe_perm_id = html.escape(permanent_id or "N/A")
    safe_bureau = html.escape(bureau)
    safe_category = html.escape(category.replace("_", " ").title())
    safe_date = html.escape(received_date)
    desc_preview = description.strip()
    if len(desc_preview) > 280:
        desc_preview = desc_preview[:280] + "..."
    safe_desc = html.escape(desc_preview)

    subject = f"[CaseBridge Demo] Complaint Registered - Tracking ID: {case_no}"

    # Plain text version (No citizen tracking links or promises of online portals)
    text_content = f"""Dear {safe_name},

Thank you for submitting your grievance through CaseBridge Demo.
Your complaint has been registered in the demonstration monitoring system.

COMPLAINT DETAILS
--------------------------------------------------
Tracking ID (Case Number): {case_no}
Institution: {institution_name} ({permanent_id})
Assigned Bureau/Cell: {bureau}
Category: {category.replace("_", " ").title()}
Filing Date: {received_date}
Current Status: Pending

Description Summary:
{desc_preview}

Please retain your Tracking ID ({case_no}) for any future reference regarding this record.

Sincerely,
CaseBridge Demo Desk
--------------------------------------------------
This is an automated demonstration notification. Please do not reply directly to this email.
"""

    # Branded HTML version (Government Navy #1E3A8A palette, Demo branding, No tracking buttons)
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1E3A8A; padding: 24px 32px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 8px;">CaseBridge Demo</span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; line-height: 1.3;">CaseBridge Demo Portal</h1>
                    <p style="margin: 4px 0 0 0; color: #93C5FD; font-size: 13px;">Grievance Redressal Demonstration System</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #0F172A;">Complaint Registration Notice</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Dear <strong>{safe_name}</strong>,<br>
                Your complaint has been successfully registered in the CaseBridge demonstration system under the assigned division.
              </p>

              <!-- Tracking ID Highlight Box -->
              <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #1E40AF; letter-spacing: 0.025em; display: block; margin-bottom: 4px;">Tracking ID</span>
                      <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 22px; font-weight: 800; color: #1E3A8A; letter-spacing: 0.05em;">{safe_case_no}</span>
                    </td>
                    <td align="right">
                      <span style="display: inline-block; background-color: #FEF3C7; color: #78350F; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; border: 1px solid #FCD34D;">Pending</span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Metadata Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; border-collapse: collapse; font-size: 13px;">
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B; width: 38%;">Institution:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_inst_name} <span style="color: #64748B; font-weight: 400;">({safe_perm_id})</span></td>
                </tr>
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B;">Assigned Division:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_bureau}</td>
                </tr>
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B;">Grievance Category:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_category}</td>
                </tr>
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B;">Filing Date:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_date}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748B; vertical-align: top;">Summary:</td>
                  <td style="padding: 10px 0; color: #334155; line-height: 1.5;">{safe_desc}</td>
                </tr>
              </table>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748B;">
                Please preserve your Tracking ID (<strong>{safe_case_no}</strong>) for your records. This is an informational demonstration notification.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #475569;">CaseBridge Demo</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">Demonstration Grievance Redressal System</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return subject, html_content, text_content


def render_status_update_templates(
    case_no: str,
    complainant_name: str,
    from_status: str,
    to_status: str,
    remarks: Optional[str],
    institution_name: Optional[str],
    action_date: str,
    frontend_url: str = "",
) -> tuple[str, str, str]:
    """Generate subject, HTML body, and plain-text fallback for case status updates.

    Contains status transition details, dates, and administrative remarks.
    Does not promise public online tracking or expose timelines.
    """
    safe_name = html.escape(complainant_name or "Complainant")
    safe_case_no = html.escape(case_no)
    safe_from = html.escape(from_status.replace("_", " ").title())
    safe_to = html.escape(to_status.replace("_", " ").title())
    safe_inst = html.escape(institution_name or "Educational Institution")
    safe_date = html.escape(action_date)
    safe_remarks = html.escape(
        remarks.strip() if remarks and remarks.strip() else "Administrative status progression recorded."
    )

    badge_bg, badge_fg = _get_status_badge_style(to_status)

    subject = f"[CaseBridge Demo] Status Update for Complaint {case_no}: {safe_to}"

    # Plain text version (No citizen tracking links or promises of online portals)
    text_content = f"""Dear {safe_name},

An administrative update has been recorded regarding your complaint (Tracking ID: {case_no}).

STATUS UPDATE DETAILS
--------------------------------------------------
Tracking ID: {case_no}
Institution: {institution_name or "Educational Institution"}
Previous Status: {from_status.replace("_", " ").title()}
Updated Status: {to_status.replace("_", " ").title()}
Update Date: {action_date}

Action Remarks / Notes:
{remarks or "Administrative status progression recorded."}

Please retain your Tracking ID ({case_no}) for any future reference regarding this record.

Sincerely,
CaseBridge Demo Desk
--------------------------------------------------
This is an automated demonstration notification. Please do not reply directly to this email.
"""

    # Branded HTML version (Government Navy #1E3A8A palette, Demo branding, No tracking buttons)
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Container Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1E3A8A; padding: 24px 32px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 8px;">CaseBridge Demo</span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; line-height: 1.3;">CaseBridge Demo Portal</h1>
                    <p style="margin: 4px 0 0 0; color: #93C5FD; font-size: 13px;">Grievance Redressal Demonstration System</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #0F172A;">Complaint Status Progression</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Dear <strong>{safe_name}</strong>,<br>
                An administrative update has been recorded regarding your complaint in the CaseBridge demonstration system.
              </p>

              <!-- Status Transition Box -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width: 50%;">
                      <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 4px;">Tracking ID</span>
                      <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 16px; font-weight: 700; color: #1E3A8A;">{safe_case_no}</span>
                    </td>
                    <td style="width: 50%;" align="right">
                      <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 6px;">New Status</span>
                      <span style="display: inline-block; background-color: {badge_bg}; color: {badge_fg}; font-size: 13px; font-weight: 700; padding: 4px 14px; border-radius: 9999px; border: 1px solid rgba(0, 0, 0, 0.08);">{safe_to}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Metadata Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; border-collapse: collapse; font-size: 13px;">
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B; width: 38%;">Institution:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_inst}</td>
                </tr>
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B;">Previous Status:</td>
                  <td style="padding: 10px 0; color: #64748B; text-decoration: line-through;">{safe_from}</td>
                </tr>
                <tr style="border-bottom: 1px solid #F1F5F9;">
                  <td style="padding: 10px 0; color: #64748B;">Date of Update:</td>
                  <td style="padding: 10px 0; color: #0F172A; font-weight: 600;">{safe_date}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748B; vertical-align: top;">Remarks / Action:</td>
                  <td style="padding: 10px 0; color: #1E293B; line-height: 1.5; font-weight: 500;">{safe_remarks}</td>
                </tr>
              </table>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94A3B8;">
                Please preserve your Tracking ID (<strong>{safe_case_no}</strong>) for your records. This is an informational demonstration notification.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #475569;">CaseBridge Demo</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">Demonstration Grievance Redressal System</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return subject, html_content, text_content


def send_complaint_submission_notification(
    case_no: str,
    recipient_email: str,
    complainant_name: str,
    institution_name: str,
    permanent_id: str,
    bureau: str,
    category: str,
    received_date: str,
    description: str,
    config: Optional[EmailConfig] = None,
) -> bool:
    """Async task target: generate templates and send confirmation email."""
    try:
        if not recipient_email or not recipient_email.strip():
            logger.debug("No recipient email provided for case %s; skipping email", case_no)
            return False

        if config is None:
            config = get_email_config()

        subject, html_content, text_content = render_complaint_submission_templates(
            case_no=case_no,
            complainant_name=complainant_name,
            institution_name=institution_name,
            permanent_id=permanent_id,
            bureau=bureau,
            category=category,
            received_date=received_date,
            description=description,
        )

        return send_email(
            to_email=recipient_email.strip(),
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            config=config,
        )
    except Exception as exc:
        logger.error(
            "Unexpected error sending complaint submission notification for case %s to %s: %s",
            case_no,
            recipient_email,
            type(exc).__name__,
        )
        return False


def send_status_update_notification(
    case_no: str,
    recipient_email: str,
    complainant_name: str,
    from_status: str,
    to_status: str,
    remarks: Optional[str],
    institution_name: Optional[str],
    action_date: str,
    config: Optional[EmailConfig] = None,
) -> bool:
    """Async task target: generate templates and send status progression email."""
    try:
        if not recipient_email or not recipient_email.strip():
            logger.debug("No recipient email provided for case %s; skipping status update email", case_no)
            return False

        if config is None:
            config = get_email_config()

        subject, html_content, text_content = render_status_update_templates(
            case_no=case_no,
            complainant_name=complainant_name,
            from_status=from_status,
            to_status=to_status,
            remarks=remarks,
            institution_name=institution_name,
            action_date=action_date,
        )

        return send_email(
            to_email=recipient_email.strip(),
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            config=config,
        )
    except Exception as exc:
        logger.error(
            "Unexpected error sending status update notification for case %s to %s: %s",
            case_no,
            recipient_email,
            type(exc).__name__,
        )
        return False
