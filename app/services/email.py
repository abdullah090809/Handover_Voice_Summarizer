import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.cores.config import settings

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def _send_email(to_email: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.gmail_smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(settings.gmail_smtp_user, settings.gmail_smtp_password)
        server.sendmail(settings.gmail_smtp_user, to_email, msg.as_string())


def send_verification_email(to_email: str, otp_code: str):
    _send_email(
        to_email=to_email,
        subject="Verify your email — Handover Voice Summarizer",
        html_body=f"""
            <h2>Verify your email</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 4px;">{otp_code}</h1>
            <p>This code expires in 10 minutes.</p>
        """,
    )


def send_urgent_handover_email(to_email: str, resident_name: str | None, summary: str, note_id: int):
    escaped_resident_name = html.escape(resident_name) if resident_name else 'Not specified'
    escaped_summary = html.escape(summary)
    _send_email(
        to_email=to_email,
        subject=f"High Urgency Handover Alert{f' — {escaped_resident_name}' if resident_name else ''}",
        html_body=f"""
            <h2>High Urgency Handover Note</h2>
            <p><strong>Resident:</strong> {escaped_resident_name}</p>
            <p><strong>Summary:</strong> {escaped_summary}</p>
            <p><a href="#">View full note (ID: {note_id})</a></p>
        """,
    )


def send_password_reset_email(to_email: str, otp_code: str):
    _send_email(
        to_email=to_email,
        subject="Reset your password — Handover Voice Summarizer",
        html_body=f"""
            <h2>Reset your password</h2>
            <p>Your password reset code is:</p>
            <h1 style="letter-spacing: 4px;">{otp_code}</h1>
            <p>This code expires in 10 minutes.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
        """,
    )