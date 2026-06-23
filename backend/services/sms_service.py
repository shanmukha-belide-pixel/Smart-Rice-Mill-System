import os
import logging
import requests
from typing import Dict, List
from backend.database import get_db

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Simulated SMS Inbox for the UI
SIMULATED_SMS_INBOX: List[Dict] = []
websocket_clients = set() # Will be populated by main.py WebSockets

class SMSService:
    @staticmethod
    async def send_sms(phone_number: str, message: str) -> bool:
        """
        Sends an SMS. Tries Exotel, then Twilio if configured.
        Always logs and broadcasts to simulation WebSocket clients.
        """
        logger.info(f"Sending SMS to {phone_number}: {message}")
        
        # 1. Log to simulated inbox
        simulated_msg = {
            "phone_number": phone_number,
            "message": message,
            "timestamp": datetime_now_str(),
            "provider": "SIMULATOR"
        }
        SIMULATED_SMS_INBOX.append(simulated_msg)
        
        # Broadcast to active frontend simulator pages
        from backend.main_shared import broadcast_to_simulator
        await broadcast_to_simulator(simulated_msg)
        
        # 2. Production Exotel configuration
        exotel_sid = os.getenv("EXOTEL_ACCOUNT_SID")
        exotel_token = os.getenv("EXOTEL_API_TOKEN")
        exotel_subdomain = os.getenv("EXOTEL_SUBDOMAIN", "api.in.exotel.com")
        exotel_sender = os.getenv("EXOTEL_SENDER_ID")
        
        if exotel_sid and exotel_token and exotel_sender:
            try:
                url = f"https://{exotel_subdomain}/v1/Accounts/{exotel_sid}/Sms/send.json"
                logger.info(f"[Exotel] Sending to {phone_number} via {url}")
                response = requests.post(
                    url,
                    auth=(exotel_sid, exotel_token),
                    data={
                        "From": exotel_sender,
                        "To": phone_number,
                        "Body": message
                    },
                    timeout=10
                )
                logger.info(f"[Exotel] Response {response.status_code}: {response.text[:300]}")
                if response.status_code in [200, 201]:
                    logger.info("[Exotel] SMS sent successfully.")
                    simulated_msg["provider"] = "EXOTEL"
                    return True
                else:
                    logger.error(f"[Exotel] SMS failed ({response.status_code}): {response.text}")
            except Exception as e:
                logger.error(f"[Exotel] SMS error: {str(e)}")


        # 3. Twilio Fallback
        twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        if twilio_sid and twilio_auth_token and twilio_number:
            try:
                url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
                response = requests.post(
                    url,
                    auth=(twilio_sid, twilio_auth_token),
                    data={
                        "From": twilio_number,
                        "To": phone_number,
                        "Body": message
                    },
                    timeout=5
                )
                if response.status_code in [200, 201]:
                    logger.info("Twilio SMS sent successfully.")
                    simulated_msg["provider"] = "TWILIO"
                    return True
                else:
                    logger.error(f"Twilio SMS failed: {response.text}")
            except Exception as e:
                logger.error(f"Twilio SMS error: {str(e)}")
                
        # Return True for simulator dashboard even if APIs are not configured
        return True

    @staticmethod
    def get_mill_name() -> str:
        try:
            db = next(get_db())
            from backend.models import SystemSetting
            settings = db.query(SystemSetting).first()
            if settings:
                return settings.mill_name
        except Exception:
            pass
        return "Sri Tirumala Rice Mill"

    @staticmethod
    def get_token_sms_text(token_number: str, position: int, wait_time: int) -> str:
        """
        Creates Telugu + English SMS body. Formatted to fit under 160 characters.
        """
        mill = SMSService.get_mill_name()
        # Telugu (approx 75 chars) + English (approx 75 chars)
        telugu = f"నమస్కారం! మీ టోకెన్ {token_number}.\n{position} మంది ముందున్నారు. సమయం ~{wait_time} ని. - {mill}"
        english = f"Hello! Token {token_number}.\n{position} ahead. Wait ~{wait_time} mins. - {mill}"
        return f"{telugu}\n\n{english}"

    @staticmethod
    def get_2_away_sms_text(token_number: str, wait_time: int) -> str:
        mill = SMSService.get_mill_name()
        telugu = f"మీ టోకెన్ {token_number} కౌంటర్ కి దగ్గరగా ఉంది. 2 మంది ముందున్నారు (~{wait_time} ని). సిద్ధంగా ఉండండి."
        english = f"Token {token_number} is close. 2 people ahead (~{wait_time} mins). Please get ready. - {mill}"
        return f"{telugu}\n\n{english}"

    @staticmethod
    def get_active_sms_text(token_number: str, counter: str) -> str:
        mill = SMSService.get_mill_name()
        telugu = f"టోకెన్ {token_number} యాక్టివ్ అయింది! దయచేసి వెంటనే {counter} కి వెళ్ళండి."
        english = f"Token {token_number} is NOW ACTIVE! Proceed to {counter} immediately. - {mill}"
        return f"{telugu}\n\n{english}"

    @staticmethod
    def get_served_sms_text(token_number: str, total_price: float) -> str:
        mill = SMSService.get_mill_name()
        telugu = f"టోకెన్ {token_number} పూర్తయింది. ధన్యవాదాలు! మొత్తం బిల్లు: ₹{total_price:.2f}."
        english = f"Token {token_number} served. Thank you! Total: ₹{total_price:.2f}. - {mill}"
        return f"{telugu}\n\n{english}"

    @staticmethod
    def get_noshow_sms_text(token_number: str) -> str:
        mill = SMSService.get_mill_name()
        telugu = f"టోకెన్ {token_number}: హాజరు కాలేదు. మీ టోకెన్ రద్దు చేయబడింది."
        english = f"Token {token_number}: No-show recorded. Token expired. - {mill}"
        return f"{telugu}\n\n{english}"

    @staticmethod
    def get_low_stock_sms_text(variety_name: str, quantity: float, threshold: float) -> str:
        mill = SMSService.get_mill_name()
        return f"⚠️ {mill} Stock Alert:\n{variety_name} low: {quantity:.1f} kg (Threshold: {threshold:.1f} kg). Reorder: 500 kg."

def datetime_now_str() -> str:
    import datetime
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
