import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_otp_email(to_email: str, otp: str, mill_name: str = "Sri Trimula Rice Mill") -> bool:
        """
        Sends an OTP verification email via Gmail SMTP.
        Requires GMAIL_USER and GMAIL_APP_PASS environment variables.
        Falls back to simulation mode if not configured.
        """
        gmail_user = os.getenv("GMAIL_USER")
        gmail_pass = os.getenv("GMAIL_APP_PASS")

        logger.info(f"[Email OTP] Sending OTP {otp} to {to_email}")

        if not gmail_user or not gmail_pass:
            logger.warning("[Email OTP] Gmail not configured. Running in simulator mode.")
            logger.info(f"[Email OTP SIMULATOR] To: {to_email} | OTP: {otp}")
            return True  # Simulator: always succeeds

        try:
            subject = f"Your {mill_name} Verification Code"
            body_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; background: #f9f9f9; border-radius: 12px;">
                <h2 style="color: #111; margin-bottom: 4px;">{mill_name}</h2>
                <p style="color: #555; font-size: 14px;">Queue Management System</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
                <p style="color: #333; font-size: 15px;">Your verification code is:</p>
                <div style="font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #111; background: #fff; border: 2px dashed #d97706; border-radius: 10px; padding: 16px 24px; text-align: center; margin: 16px 0;">
                    {otp}
                </div>
                <p style="color: #888; font-size: 13px;">This code is valid for <strong>5 minutes</strong>. Do not share it with anyone.</p>
                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
                <p style="color: #aaa; font-size: 11px;">If you did not request this, please ignore this email.</p>
            </div>
            """

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{mill_name} <{gmail_user}>"
            msg["To"] = to_email
            msg.attach(MIMEText(body_html, "html"))

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(gmail_user, gmail_pass)
                server.sendmail(gmail_user, to_email, msg.as_string())

            logger.info(f"[Email OTP] Successfully sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"[Email OTP] Failed to send to {to_email}: {e}")
            return False
