"""Email notification service for CaseBridge (SIH26264).

Provides asynchronous, non-blocking email delivery via standard SMTP for:
1. Complaint registration confirmation to complainant with tracking ID and status link.
2. Status change notifications to complainant with updated status, remarks, and status link.

Configured entirely via environment variables (no hardcoded credentials).
All send operations fail softly: logs error and never blocks or aborts API operations.
"""

from __future__ import annotations

import html
import logging
import os
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SMTPConfig:
    host: str
    port: int
    username: str
    password: str
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    timeout: int
    frontend_url: str


def get_smtp_config() -> SMTPConfig:
    """Load SMTP configuration dynamically from environment variables."""
    return SMTPConfig(
        host=os.getenv("SMTP_HOST", "").strip(),
        port=int(os.getenv("SMTP_PORT", "587")),
        username=os.getenv("SMTP_USERNAME", "").strip(),
        password=os.getenv("SMTP_PASSWORD", ""),
        from_email=os.getenv("SMTP_FROM_EMAIL", "notifications@casebridge.aicte.gov.in").strip(),
        from_name=os.getenv("SMTP_FROM_NAME", "CaseBridge Grievance Redressal").strip(),
        use_tls=os.getenv("SMTP_TLS", "true").lower() in ("true", "1", "yes"),
        use_ssl=os.getenv("SMTP_SSL", "false").lower() in ("true", "1", "yes"),
        timeout=int(os.getenv("SMTP_TIMEOUT", "10")),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/"),
    )


def send_email_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
    config: Optional[SMTPConfig] = None,
) -> bool:
    """Send a multipart HTML + plain-text email via SMTP.

    Returns True if sent, False otherwise. Catches and logs all errors so API
    callers are never blocked or faulted.
    """
    if config is None:
        config = get_smtp_config()

    if not config.host:
        logger.info(
            "SMTP_HOST is not configured; skipping email delivery to %s for subject '%s'",
            to_email,
            subject,
        )
        return False

    if not to_email or "@" not in to_email:
        logger.warning("Recipient email '%s' is empty or invalid; skipping email delivery", to_email)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["To"] = to_email
        if config.from_name:
            msg["From"] = f"{config.from_name} <{config.from_email}>"
        else:
            msg["From"] = config.from_email

        # Attach plain text first, then HTML alternative
        part_text = MIMEText(text_content, "plain", "utf-8")
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)

        # Connect via SMTP_SSL or standard SMTP
        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.host, config.port, timeout=config.timeout)
        else:
            server = smtplib.SMTP(config.host, config.port, timeout=config.timeout)

        with server:
            if not config.use_ssl and config.use_tls:
                server.starttls()
            if config.username and config.password:
                server.login(config.username, config.password)
            server.send_message(msg)

        logger.info("Successfully dispatched email to %s (subject: %s)", to_email, subject)
        return True

    except Exception as exc:
        logger.error(
            "SMTP delivery failed to %s for subject '%s': %s",
            to_email,
            subject,
            exc,
            exc_info=True,
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
    frontend_url: str,
) -> tuple[str, str, str]:
    """Generate subject, HTML body, and plain-text fallback for complaint registration."""
    tracking_url = f"{frontend_url}/cases/{case_no}"
    safe_name = html.escape(complainant_name or "Complainant")
    safe_case_no = html.escape(case_no)
    safe_inst_name = html.escape(institution_name or "Technical Institution")
    safe_perm_id = html.escape(permanent_id or "N/A")
    safe_bureau = html.escape(bureau)
    safe_category = html.escape(category.replace("_", " ").title())
    safe_date = html.escape(received_date)
    desc_preview = description.strip()
    if len(desc_preview) > 280:
        desc_preview = desc_preview[:280] + "..."
    safe_desc = html.escape(desc_preview)

    subject = f"[CaseBridge] Complaint Registered - Tracking ID: {case_no}"

    # Plain text version
    text_content = f"""Dear {safe_name},

Thank you for contacting CaseBridge Grievance Redressal Monitoring Portal.
Your complaint has been successfully registered into the central tracking system.

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

TRACK YOUR COMPLAINT ONLINE
--------------------------------------------------
You can track the ongoing actions, assigned officer, and disposal timeline at:
{tracking_url}

Please retain your Tracking ID ({case_no}) for any future inquiries.

Sincerely,
CaseBridge Grievance Redressal Monitoring Desk
All India Council for Technical Education (AICTE)
--------------------------------------------------
This is an automated operational notification. Please do not reply directly to this email.
"""

    # Branded HTML version (Government Navy #1E3A8A palette)
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
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 8px;">Official Grievance Desk</span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; line-height: 1.3;">CaseBridge Monitoring Portal</h1>
                    <p style="margin: 4px 0 0 0; color: #93C5FD; font-size: 13px;">AICTE Integrated Institution Grievance Redressal</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #0F172A;">Complaint Registration Confirmation</h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Dear <strong>{safe_name}</strong>,<br>
                Your complaint has been successfully registered into the grievance monitoring system. An authoritative case file has been initialized under the jurisdiction of the assigned bureau.
              </p>

              <!-- Tracking ID Highlight Box -->
              <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #1E40AF; letter-spacing: 0.025em; display: block; margin-bottom: 4px;">Your Official Tracking ID</span>
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

              <!-- Call to Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="{tracking_url}" target="_blank" style="display: inline-block; background-color: #1E3A8A; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(30, 58, 138, 0.2);">Track Complaint Status &rarr;</a>
                  </td>
                </tr>
              </table>

              <!-- Direct link fallback -->
              <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.5; color: #64748B; text-align: center;">
                If the button above does not work, visit directly:<br>
                <a href="{tracking_url}" style="color: #2563EB; word-break: break-all;">{tracking_url}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94A3B8;">
                Please preserve your Tracking ID (<strong>{safe_case_no}</strong>) for reference. Whenever an administrative action or status transition is posted, an automated progress alert will be delivered to this email address.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #475569;">CaseBridge Grievance Redressal Monitoring System</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">All India Council for Technical Education (AICTE) &bull; Automated Citizen Notification</p>
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
    frontend_url: str,
) -> tuple[str, str, str]:
    """Generate subject, HTML body, and plain-text fallback for case status updates."""
    tracking_url = f"{frontend_url}/cases/{case_no}"
    safe_name = html.escape(complainant_name or "Complainant")
    safe_case_no = html.escape(case_no)
    safe_from = html.escape(from_status.replace("_", " ").title())
    safe_to = html.escape(to_status.replace("_", " ").title())
    safe_inst = html.escape(institution_name or "Educational Institution")
    safe_date = html.escape(action_date)
    safe_remarks = html.escape(remarks.strip() if remarks and remarks.strip() else "Official administrative action recorded.")

    badge_bg, badge_fg = _get_status_badge_style(to_status)

    subject = f"[CaseBridge] Status Update for Complaint {case_no}: {safe_to}"

    # Plain text version
    text_content = f"""Dear {safe_name},

An update has been registered regarding your complaint (Tracking ID: {case_no}).

STATUS UPDATE DETAILS
--------------------------------------------------
Tracking ID: {case_no}
Institution: {institution_name or "Educational Institution"}
Previous Status: {from_status.replace("_", " ").title()}
Updated Status: {to_status.replace("_", " ").title()}
Update Date: {action_date}

Action Remarks / Notes:
{remarks or "Official administrative action recorded."}

VIEW COMPLETE CASE HISTORY
--------------------------------------------------
You can inspect the complete timeline of actions, notices, and due dates at:
{tracking_url}

Sincerely,
CaseBridge Grievance Redressal Monitoring Desk
All India Council for Technical Education (AICTE)
--------------------------------------------------
This is an automated operational notification. Please do not reply directly to this email.
"""

    # Branded HTML version
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
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 8px;">Grievance Status Update</span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; line-height: 1.3;">CaseBridge Monitoring Portal</h1>
                    <p style="margin: 4px 0 0 0; color: #93C5FD; font-size: 13px;">AICTE Integrated Institution Grievance Redressal</p>
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
                The administrative authority handling your complaint has posted a progress event. The complaint status has been updated as detailed below.
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

              <!-- Call to Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="{tracking_url}" target="_blank" style="display: inline-block; background-color: #1E3A8A; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(30, 58, 138, 0.2);">View Full Case Timeline &rarr;</a>
                  </td>
                </tr>
              </table>

              <!-- Direct link fallback -->
              <p style="margin: 0 0 20px 0; font-size: 12px; line-height: 1.5; color: #64748B; text-align: center;">
                Direct tracking URL:<br>
                <a href="{tracking_url}" style="color: #2563EB; word-break: break-all;">{tracking_url}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94A3B8;">
                You will continue to receive automated notifications as your complaint progresses toward resolution.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 600; color: #475569;">CaseBridge Grievance Redressal Monitoring System</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">All India Council for Technical Education (AICTE) &bull; Automated Citizen Notification</p>
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
    config: Optional[SMTPConfig] = None,
) -> bool:
    """Async task target: generate templates and send confirmation email."""
    try:
        if not recipient_email or not recipient_email.strip():
            logger.debug("No recipient email provided for case %s; skipping email", case_no)
            return False

        if config is None:
            config = get_smtp_config()

        subject, html_content, text_content = render_complaint_submission_templates(
            case_no=case_no,
            complainant_name=complainant_name,
            institution_name=institution_name,
            permanent_id=permanent_id,
            bureau=bureau,
            category=category,
            received_date=received_date,
            description=description,
            frontend_url=config.frontend_url,
        )

        return send_email_smtp(
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
            exc,
            exc_info=True,
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
    config: Optional[SMTPConfig] = None,
) -> bool:
    """Async task target: generate templates and send status progression email."""
    try:
        if not recipient_email or not recipient_email.strip():
            logger.debug("No recipient email provided for case %s; skipping status update email", case_no)
            return False

        if config is None:
            config = get_smtp_config()

        subject, html_content, text_content = render_status_update_templates(
            case_no=case_no,
            complainant_name=complainant_name,
            from_status=from_status,
            to_status=to_status,
            remarks=remarks,
            institution_name=institution_name,
            action_date=action_date,
            frontend_url=config.frontend_url,
        )

        return send_email_smtp(
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
            exc,
            exc_info=True,
        )
        return False
