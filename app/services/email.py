import logging

import resend

from app.cores.config import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.resend_api_key


def send_verification_email(to_email: str, otp_code: str):
    resend.Emails.send(
        {
            "from": "onboarding@resend.dev",
            "to": to_email,
            "subject": "Verify your email — Handover Voice Summarizer",
            "html": f"""
                <h2>Verify your email</h2>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing: 4px;">{otp_code}</h1>
                <p>This code expires in 10 minutes.</p>
            """,
        }
    )


def send_urgent_handover_email(to_email: str, resident_name: str | None, summary: str, note_id: int):
    resend.Emails.send(
        {
            "from": "onboarding@resend.dev",
            "to": to_email,
            "subject": f"High Urgency Handover Alert{f' — {resident_name}' if resident_name else ''}",
            "html": f"""
                <h2>High Urgency Handover Note</h2>
                <p><strong>Resident:</strong> {resident_name or 'Not specified'}</p>
                <p><strong>Summary:</strong> {summary}</p>
                <p><a href="#">View full note (ID: {note_id})</a></p>
            """,
        }
    )


def send_password_reset_email(to_email: str, otp_code: str):
    resend.Emails.send(
        {
            "from": "onboarding@resend.dev",
            "to": to_email,
            "subject": "Reset your password — Handover Voice Summarizer",
            "html": f"""
                <h2>Reset your password</h2>
                <p>Your password reset code is:</p>
                <h1 style="letter-spacing: 4px;">{otp_code}</h1>
                <p>This code expires in 10 minutes.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
            """,
        }
    )
