"""
Sri Tirumala Rice Mill — OTP Microservice
Flask-based OTP generation, delivery (Email + SMS), and verification.
"""

import os
import random
import string
import time
import smtplib
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

import requests
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# In-memory OTP Store  {identifier -> {otp_hash, expires_at, attempts}}
# Replace with Redis in production for multi-instance deployments
# ─────────────────────────────────────────────
otp_store: dict = {}

OTP_EXPIRY_SECONDS = 300   # 5 minutes
OTP_LENGTH         = 6
MAX_ATTEMPTS       = 3     # lock after 3 wrong guesses


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def generate_otp(length: int = OTP_LENGTH) -> str:
    """Generate a numeric OTP."""
    return ''.join(random.choices(string.digits, k=length))


def hash_otp(otp: str) -> str:
    """Hash OTP before storing (never store plaintext)."""
    return hashlib.sha256(otp.encode()).hexdigest()


def store_otp(identifier: str, otp: str) -> None:
    otp_store[identifier] = {
        "otp_hash":   hash_otp(otp),
        "expires_at": time.time() + OTP_EXPIRY_SECONDS,
        "attempts":   0,
    }


def verify_otp_code(identifier: str, otp: str) -> tuple[bool, str]:
    """Returns (success, message)."""
    record = otp_store.get(identifier)
    if not record:
        return False, "No OTP found. Please request a new one."

    if time.time() > record["expires_at"]:
        del otp_store[identifier]
        return False, "OTP has expired. Please request a new one."

    if record["attempts"] >= MAX_ATTEMPTS:
        return False, "Too many incorrect attempts. Please request a new OTP."

    if hash_otp(otp) != record["otp_hash"]:
        otp_store[identifier]["attempts"] += 1
        remaining = MAX_ATTEMPTS - otp_store[identifier]["attempts"]
        return False, f"Incorrect OTP. {remaining} attempt(s) remaining."

    # Correct — consume the OTP (one-time use)
    del otp_store[identifier]
    return True, "OTP verified successfully!"


# ─────────────────────────────────────────────
# Email Delivery  (Gmail SMTP)
# ─────────────────────────────────────────────

def send_email_otp(to_email: str, otp: str) -> tuple[bool, str]:
    gmail_user = os.getenv("GMAIL_USER", "")
    gmail_pass = os.getenv("GMAIL_APP_PASS", "")

    if not gmail_user or not gmail_pass:
        return False, "Email credentials not configured (set GMAIL_USER and GMAIL_APP_PASS)."

    subject = "Your OTP — Sri Tirumala Rice Mill"
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;
                background:#0f172a;color:#e2e8f0;border-radius:12px;">
      <h2 style="color:#10b981;margin-top:0;">🌾 Sri Tirumala Rice Mill</h2>
      <p style="color:#94a3b8;font-size:14px;">Your one-time verification code is:</p>
      <div style="background:#1e293b;border-radius:8px;padding:24px;text-align:center;
                  font-size:40px;font-weight:900;letter-spacing:12px;color:#f59e0b;
                  border:1px solid #334155;margin:20px 0;">
        {otp}
      </div>
      <p style="color:#64748b;font-size:12px;">
        ⏱ This code expires in <b>5 minutes</b>.<br>
        🔒 Never share this code with anyone.
      </p>
      <hr style="border-color:#1e293b;margin:24px 0;">
      <p style="color:#475569;font-size:11px;text-align:center;">
        Sri Tirumala Rice Mill • Hanamkonda, Telangana
      </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Sri Tirumala Rice Mill <{gmail_user}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_pass)
            server.sendmail(gmail_user, to_email, msg.as_string())
        return True, f"OTP sent to {to_email}"
    except smtplib.SMTPAuthenticationError:
        return False, "Gmail authentication failed. Check GMAIL_APP_PASS."
    except Exception as e:
        return False, f"Email delivery failed: {str(e)}"


# ─────────────────────────────────────────────
# SMS Delivery  (Twilio or Exotel)
# ─────────────────────────────────────────────

def send_sms_otp(phone: str, otp: str) -> tuple[bool, str]:
    # ── Twilio ──
    twilio_sid   = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN",   "")
    twilio_from  = os.getenv("TWILIO_PHONE_NUMBER", "")

    if twilio_sid and twilio_token and twilio_from:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
        data = {
            "From": twilio_from,
            "To":   phone,
            "Body": f"Sri Tirumala Rice Mill OTP: {otp}. Valid 5 mins. Do not share."
        }
        resp = requests.post(url, data=data, auth=(twilio_sid, twilio_token))
        if resp.status_code == 201:
            return True, f"OTP sent via Twilio to {phone}"
        return False, f"Twilio error: {resp.json().get('message', 'Unknown error')}"

    # ── Exotel (India) ──
    exotel_sid    = os.getenv("EXOTEL_ACCOUNT_SID",  "")
    exotel_token  = os.getenv("EXOTEL_API_TOKEN",     "")
    exotel_from   = os.getenv("EXOTEL_SENDER_ID",     "")
    exotel_domain = os.getenv("EXOTEL_SUBDOMAIN",     "api.exotel.com")

    if exotel_sid and exotel_token and exotel_from:
        url = f"https://{exotel_domain}/v1/Accounts/{exotel_sid}/Sms/send"
        data = {
            "From":   exotel_from,
            "To":     phone,
            "Body":   f"Sri Tirumala Rice Mill OTP: {otp}. Valid 5 mins. Do not share.",
        }
        resp = requests.post(url, data=data, auth=(exotel_token, exotel_token))
        if resp.status_code in (200, 201):
            return True, f"OTP sent via Exotel to {phone}"
        return False, f"Exotel error: {resp.text}"

    return False, "No SMS gateway configured (set TWILIO_* or EXOTEL_* credentials)."


# ─────────────────────────────────────────────
# Routes — REST API
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/otp/send", methods=["POST"])
def send_otp():
    """
    Send OTP via Email, SMS, or both.

    Body (JSON):
      { "type": "email" | "sms" | "both",
        "email": "...",          # required if type is email / both
        "phone": "+919XXXXXXXXX" # required if type is sms / both
      }
    """
    data = request.get_json(force=True)
    otp_type = data.get("type", "email").lower()
    email    = data.get("email", "").strip()
    phone    = data.get("phone", "").strip()

    if otp_type in ("email", "both") and not email:
        return jsonify({"success": False, "message": "Email address is required."}), 400
    if otp_type in ("sms", "both") and not phone:
        return jsonify({"success": False, "message": "Phone number is required."}), 400

    otp = generate_otp()

    results = {}
    success  = False

    if otp_type in ("email", "both"):
        ok, msg = send_email_otp(email, otp)
        results["email"] = {"success": ok, "message": msg}
        if ok:
            store_otp(email, otp)
            success = True

    if otp_type in ("sms", "both"):
        ok, msg = send_sms_otp(phone, otp)
        results["sms"] = {"success": ok, "message": msg}
        if ok:
            store_otp(phone, otp)
            success = True

    # Dev / testing: expose OTP in response when no gateway is configured
    dev_mode = not (
        os.getenv("GMAIL_APP_PASS") or
        os.getenv("TWILIO_AUTH_TOKEN") or
        os.getenv("EXOTEL_API_TOKEN")
    )

    response = {
        "success":  success,
        "results":  results,
        "expires_in": OTP_EXPIRY_SECONDS,
    }

    if dev_mode:
        # Store anyway for testing
        identifier = email or phone
        store_otp(identifier, otp)
        response["dev_otp"]   = otp   # visible in dev — remove in production!
        response["dev_note"]  = "No gateway configured — OTP shown here for testing only."
        response["success"]   = True

    return jsonify(response), 200


@app.route("/api/otp/verify", methods=["POST"])
def verify_otp():
    """
    Verify an OTP.

    Body (JSON):
      { "identifier": "email or phone used when sending",
        "otp": "123456" }
    """
    data       = request.get_json(force=True)
    identifier = data.get("identifier", "").strip()
    otp        = data.get("otp", "").strip()

    if not identifier or not otp:
        return jsonify({"success": False, "message": "identifier and otp are required."}), 400

    ok, msg = verify_otp_code(identifier, otp)
    status  = 200 if ok else 400
    return jsonify({"success": ok, "message": msg}), status


@app.route("/api/otp/status", methods=["GET"])
def otp_status():
    """Check if an OTP is pending for an identifier (for debugging)."""
    identifier = request.args.get("identifier", "").strip()
    record = otp_store.get(identifier)
    if not record:
        return jsonify({"pending": False}), 200
    remaining = max(0, int(record["expires_at"] - time.time()))
    return jsonify({
        "pending":      True,
        "expires_in":   remaining,
        "attempts_used": record["attempts"],
        "max_attempts": MAX_ATTEMPTS,
    }), 200


@app.route("/api/otp/clear", methods=["POST"])
def clear_otp():
    """Manually invalidate an OTP (e.g. on logout)."""
    data       = request.get_json(force=True)
    identifier = data.get("identifier", "").strip()
    if identifier in otp_store:
        del otp_store[identifier]
        return jsonify({"success": True, "message": "OTP cleared."}), 200
    return jsonify({"success": False, "message": "No OTP found."}), 404


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(debug=True, port=port)
