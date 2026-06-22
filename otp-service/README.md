# 🌾 Sri Tirumala Rice Mill — OTP Microservice

A lightweight **Flask-based OTP service** that:
- Generates secure 6-digit OTPs
- Delivers via **Gmail SMTP (email)** and/or **Twilio / Exotel (SMS)**
- Verifies OTPs (one-time use, 5-minute expiry, max 3 attempts)
- Provides a beautiful dark-themed test UI

---

## 🚀 Quick Start

```bash
cd otp-service

# 1. Create and activate virtualenv
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure credentials
copy .env.example .env
# Edit .env with your Gmail App Password and/or SMS credentials

# 4. Run
python app.py
```

Open **http://localhost:5001** in your browser.

---

## ⚙️ Configuration (.env)

| Variable | Description |
|---|---|
| `GMAIL_USER` | Gmail address to send from |
| `GMAIL_APP_PASS` | [Gmail App Password](https://myaccount.google.com/apppasswords) (not your regular password) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (for international SMS) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio sender number |
| `EXOTEL_ACCOUNT_SID` | Exotel SID (for Indian SMS) |
| `EXOTEL_API_TOKEN` | Exotel API token |
| `EXOTEL_SENDER_ID` | Registered DLT sender ID |

> **Dev mode**: If no gateway credentials are set, the OTP is shown directly in the UI response (for testing).

---

## 📡 API Reference

### POST `/api/otp/send`
```json
{ "type": "email",   "email": "user@example.com" }
{ "type": "sms",     "phone": "+919876543210" }
{ "type": "both",    "email": "...", "phone": "..." }
```

### POST `/api/otp/verify`
```json
{ "identifier": "user@example.com", "otp": "482931" }
```

### GET `/api/otp/status?identifier=user@example.com`

### POST `/api/otp/clear`
```json
{ "identifier": "user@example.com" }
```

---

## 🔒 Security Features

- OTPs are **SHA-256 hashed** before storage (never stored in plaintext)
- **One-time use** — consumed immediately on successful verification
- **5-minute expiry** — automatically invalidated after 300 seconds
- **3-attempt lock** — prevents brute-force guessing
- Dev OTP exposure only when **no gateway is configured**
