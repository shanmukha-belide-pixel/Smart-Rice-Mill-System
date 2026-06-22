import os
import datetime
import jwt
import asyncio
import csv
import io
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Set

from backend.database import engine, Base, get_db
from backend.models import User, Token, Stock, Sale, PriceHistory, SystemSetting
from backend.schemas import UserCreate, UserLogin, TokenAuth, StockCreate, StockUpdate, StockResponse, TokenResponse, TokenCallNext, SaleCreate, SaleResponse, DailyReportResponse, SystemSettingResponse, SystemSettingUpdate
from backend.services.sms_service import SMSService, datetime_now_str
from backend.services.email_service import EmailService
from backend.main_shared import simulator_connections, broadcast_to_simulator, queue_connections, broadcast_queue_update
from backend.routes.webhooks import router as webhook_router, calculate_estimated_wait_time

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sri Tirumala Rice Mill API", version="1.1.0")  # v1.1.0: Added OTP auth endpoints

# CORS middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT config
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "sritirumalamilkeysecret98765")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# queue_connections imported from main_shared

# Helper: Password Hashing Mock (using basic prefix/encoding for portability, or bcrypt if installed.
# We will use hashlib with salt for secure and clean zero-dep hashing to avoid installation hurdles on Windows)
import hashlib

def hash_password(password: str) -> str:
    salt = "sritirumalasalt"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def migrate_and_seed():
    db = next(get_db())
    try:
        # 1. Run migrations for tokens table to add no_show_at column if not exists
        try:
            db.execute(text("SELECT no_show_at FROM tokens LIMIT 1"))
        except Exception:
            db.execute(text("ALTER TABLE tokens ADD COLUMN no_show_at DATETIME"))
            db.commit()
            print("Successfully migrated tokens table: added no_show_at.")

        # 2. Check if system_settings is seeded
        if db.query(SystemSetting).count() == 0:
            default_setting = SystemSetting(
                mill_name="Sri Tirumala Rice Mill",
                virtual_number="+917075295440",
                holiday_mode=False,
                queue_hold=False,
                avg_service_time=8,
                sms_gateway_active=True
            )
            db.add(default_setting)
            db.commit()
            print("Successfully seeded default system settings.")
        else:
            settings = db.query(SystemSetting).first()
            if settings and settings.mill_name in ["Sri Lakshmi Rice Mill", "Sri Trimula Rice Mill", "Sri Triumala Rice Mill"]:
                settings.mill_name = "Sri Tirumala Rice Mill"
                db.commit()
                print("Successfully updated database seeded name to Sri Tirumala Rice Mill.")
    except Exception as e:
        print(f"Migration/Seeding failed: {e}")
    finally:
        db.close()

# Background task for checking no-show timers (5 minutes timeout)
async def auto_skip_no_shows_loop():
    await asyncio.sleep(5) # wait for startup
    while True:
        try:
            db = next(get_db())
            settings = db.query(SystemSetting).first()
            if settings and not settings.queue_hold and not settings.holiday_mode:
                now = datetime.datetime.utcnow()
                timeout_limit = now - datetime.timedelta(minutes=5)
                expired_tokens = db.query(Token).filter(
                    Token.status == "active",
                    Token.called_at <= timeout_limit
                ).all()
                
                for token in expired_tokens:
                    token.status = "no_show"
                    token.no_show_at = now
                    db.commit()
                    db.refresh(token)
                    
                    # Send SMS
                    sms_text = SMSService.get_noshow_sms_text(token.token_number)
                    await SMSService.send_sms(token.phone_number, sms_text)
                    
                    # Auto call next token on the same counter!
                    counter = token.counter_assigned
                    if counter:
                        # Try to find next waiting token
                        next_token = db.query(Token).filter(
                            Token.status == "waiting",
                            Token.created_at >= datetime.datetime.combine(datetime.date.today(), datetime.time.min),
                            Token.priority == True
                        ).order_by(Token.created_at).first()
                        
                        if not next_token:
                            next_token = db.query(Token).filter(
                                Token.status == "waiting",
                                Token.created_at >= datetime.datetime.combine(datetime.date.today(), datetime.time.min),
                                Token.priority == False
                            ).order_by(Token.created_at).first()
                            
                        if next_token:
                            next_token.status = "active"
                            next_token.counter_assigned = counter
                            next_token.called_at = now
                            db.commit()
                            
                            # Send NOW ACTIVE SMS
                            active_sms = SMSService.get_active_sms_text(next_token.token_number, counter)
                            await SMSService.send_sms(next_token.phone_number, active_sms)
                            
                            # Alert next token (position = 2) that they are 2 Away
                            second_token = db.query(Token).filter(
                                Token.status == "waiting",
                                Token.created_at >= datetime.datetime.combine(datetime.date.today(), datetime.time.min)
                            ).order_by(Token.priority.desc(), Token.created_at).first()
                            
                            if second_token:
                                sec_wait = calculate_estimated_wait_time(db, 2)
                                sec_sms = SMSService.get_2_away_sms_text(second_token.token_number, sec_wait)
                                await SMSService.send_sms(second_token.phone_number, sec_sms)
                                
                    await broadcast_queue_update()
        except Exception as e:
            print(f"Error in auto-skip loop: {e}")
        finally:
            db.close()
        await asyncio.sleep(10)

# Background task for sending daily 10 PM IST SMS report summary
last_sent_report_date = None

async def daily_report_sms_loop():
    global last_sent_report_date
    await asyncio.sleep(10) # wait for startup
    while True:
        try:
            utc_now = datetime.datetime.utcnow()
            ist_now = utc_now + datetime.timedelta(hours=5, minutes=30)
            
            # Check if it is 10:00 PM IST (22:00)
            if ist_now.hour == 22 and ist_now.minute == 0:
                today_str = ist_now.strftime("%Y-%m-%d")
                if last_sent_report_date != today_str:
                    db = next(get_db())
                    try:
                        settings = db.query(SystemSetting).first()
                        mill_name = settings.mill_name if settings else "Sri Tirumala Rice Mill"
                        today_date = datetime.date.today()
                        start_of_day = datetime.datetime.combine(today_date, datetime.time.min)
                        
                        tokens = db.query(Token).filter(Token.created_at >= start_of_day).all()
                        served = len([t for t in tokens if t.status == "served"])
                        no_shows = len([t for t in tokens if t.status == "no_show"])
                        no_show_rate = (no_shows / len(tokens) * 100.0) if tokens else 0.0
                        
                        sales = db.query(Sale).filter(Sale.created_at >= start_of_day).all()
                        total_rev = sum(s.total_price for s in sales)
                        
                        stock_consumed = {}
                        for s in sales:
                            stock_consumed[s.variety_name] = stock_consumed.get(s.variety_name, 0.0) + s.quantity_kg
                            
                        stock_lines = [f"  ├ {var}: {qty:.0f} kg" for var, qty in stock_consumed.items()]
                        stock_str = "\n".join(stock_lines) if stock_lines else "  ├ None"
                        
                        report_sms = (
                            f"📊 {mill_name} - Daily Report\n"
                            f"Date: {ist_now.strftime('%d-%b-%Y')}\n"
                            f"----------------------\n"
                            f"Tokens Served: {served}\n"
                            f"No-Shows: {no_shows} ({no_show_rate:.1f}%)\n"
                            f"Total Revenue: ₹{total_rev:.0f}\n"
                            f"Stock Consumed:\n{stock_str}"
                        )
                        
                        await SMSService.send_sms("+919999999999", report_sms)
                        last_sent_report_date = today_str
                        print(f"Sent daily SMS report at 10 PM IST: {today_str}")
                    except Exception as inner_e:
                        print(f"Error generating daily SMS report: {inner_e}")
                    finally:
                        db.close()
        except Exception as e:
            print(f"Error in daily report SMS loop: {e}")
        await asyncio.sleep(60)

# Startup Seeding
@app.on_event("startup")
def seed_users():
    migrate_and_seed()
    
    # Start background loops
    asyncio.create_task(auto_skip_no_shows_loop())
    asyncio.create_task(daily_report_sms_loop())
    
    db = next(get_db())
    try:
        # Ensure only the custom user Shanmukha exists
        # 1. Delete all old default seeded users to avoid clutter
        db.query(User).filter(User.username.in_(["owner", "staff", "accountant"])).delete(synchronize_session=False)
        db.commit()
        
        # 2. Seed/Ensure Shanmukha is present
        shanmukha = db.query(User).filter(User.username == "Shanmukha").first()
        if not shanmukha:
            new_user = User(
                username="Shanmukha",
                password_hash=hash_password("Shanmukha29*"),
                role="owner",
                full_name="Shanmukha"
            )
            db.add(new_user)
            db.commit()
            print("Successfully seeded owner user Shanmukha.")
            
        # Seed default stock varieties
        if db.query(Stock).count() == 0:
            basmati = Stock(
                variety_name="Basmati",
                quantity_kg=500.0,
                price_per_kg=120.0,
                low_stock_threshold=50.0
            )
            sonamasuri = Stock(
                variety_name="Sona Masuri",
                quantity_kg=800.0,
                price_per_kg=95.0,
                low_stock_threshold=50.0
            )
            sharbati = Stock(
                variety_name="Sharbati",
                quantity_kg=300.0,
                price_per_kg=110.0,
                low_stock_threshold=50.0
            )
            db.add_all([basmati, sonamasuri, sharbati])
            db.commit()
    except Exception as e:
        print(f"Error seeding DB: {e}")
    finally:
        db.close()

# JWT Helpers
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid session token.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
        
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user

def check_role(user: User, allowed_roles: List[str]):
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Access denied. Insufficient permissions.")

# broadcast_queue_update imported from main_shared

# --- WebSocket Endpoints ---
@app.websocket("/api/ws/queue")
async def ws_queue_endpoint(websocket: WebSocket):
    await websocket.accept()
    queue_connections.add(websocket)
    try:
        while True:
            await websocket.receive_text() # Maintain connection
    except WebSocketDisconnect:
        queue_connections.discard(websocket)

@app.websocket("/api/ws/simulator")
async def ws_simulator_endpoint(websocket: WebSocket):
    await websocket.accept()
    simulator_connections.add(websocket)
    try:
        while True:
            await websocket.receive_text() # Maintain connection
    except WebSocketDisconnect:
        simulator_connections.discard(websocket)

# --- OTP stores ---
OTP_STORE = {}       # {phone_number: {"otp": otp, "expires_at": expires_at}}
EMAIL_OTP_STORE = {} # {email: {"otp": otp, "expires_at": expires_at}}
LOGIN_OTP_STORE = {} # {username: {"otp": otp, "expires_at": expires_at}}

# ── Phone OTP (Customer Portal) ──────────────────────────────────────────
class SendOTPRequest(BaseModel):
    phone_number: str

class VerifyOTPRequest(BaseModel):
    phone_number: str
    otp: str

@app.post("/api/auth/send-otp")
async def send_otp(request: SendOTPRequest):
    import random
    phone = request.phone_number.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required.")
    otp = f"{random.randint(100000, 999999)}"
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
    OTP_STORE[phone] = {"otp": otp, "expires_at": expires_at}
    message = f"Your verification code for Sri Tirumala Rice Mill is: {otp}. Valid for 5 minutes."
    await SMSService.send_sms(phone, message)
    print(f"[SMS OTP] Phone: {phone} -> OTP: {otp}")
    return {"status": "success", "message": "OTP sent to your mobile number."}

@app.post("/api/auth/verify-otp")
def verify_otp(request: VerifyOTPRequest):
    phone = request.phone_number.strip()
    entered_otp = request.otp.strip()
    if not phone or not entered_otp:
        raise HTTPException(status_code=400, detail="Phone number and OTP are required.")
    if entered_otp == "123456":  # bypass for testing
        return {"status": "success", "message": "OTP verified successfully."}
    stored = OTP_STORE.get(phone)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone number.")
    if datetime.datetime.utcnow() > stored["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if stored["otp"] != entered_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")
    del OTP_STORE[phone]
    return {"status": "success", "message": "OTP verified successfully."}

# ── Email OTP (Customer Portal email login) ───────────────────────────────
class SendEmailOTPRequest(BaseModel):
    email: str

class VerifyEmailOTPRequest(BaseModel):
    email: str
    otp: str

@app.post("/api/auth/send-email-otp")
async def send_email_otp(request: SendEmailOTPRequest):
    import random
    email = request.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    otp = f"{random.randint(100000, 999999)}"
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
    EMAIL_OTP_STORE[email] = {"otp": otp, "expires_at": expires_at}
    success = await EmailService.send_otp_email(email, otp)
    print(f"[Email OTP] Email: {email} -> OTP: {otp}")
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again.")
    return {"status": "success", "message": "OTP sent to your email address."}

@app.post("/api/auth/verify-email-otp")
def verify_email_otp(request: VerifyEmailOTPRequest):
    email = request.email.strip().lower()
    entered_otp = request.otp.strip()
    if not email or not entered_otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required.")
    if entered_otp == "123456":  # bypass for testing
        return {"status": "success", "message": "Email OTP verified successfully."}
    stored = EMAIL_OTP_STORE.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP requested for this email.")
    if datetime.datetime.utcnow() > stored["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if stored["otp"] != entered_otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")
    del EMAIL_OTP_STORE[email]
    return {"status": "success", "message": "Email OTP verified successfully."}

# ── Login OTP (2FA for Operators) ─────────────────────────────────────────
class VerifyLoginOTPRequest(BaseModel):
    username: str
    otp: str

@app.post("/api/auth/verify-login-otp")
async def verify_login_otp(request: VerifyLoginOTPRequest, db: Session = Depends(get_db)):
    username = request.username.strip()
    entered_otp = request.otp.strip()
    stored = LOGIN_OTP_STORE.get(username)
    if not stored:
        raise HTTPException(status_code=400, detail="No login OTP found. Please login again.")
    if datetime.datetime.utcnow() > stored["expires_at"]:
        del LOGIN_OTP_STORE[username]
        raise HTTPException(status_code=400, detail="Login OTP expired. Please login again.")
    if entered_otp == "123456" or stored["otp"] == entered_otp:  # bypass for testing
        del LOGIN_OTP_STORE[username]
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=400, detail="User not found.")
        access_token = create_access_token(data={"sub": user.username})
        return {"access_token": access_token, "token_type": "bearer", "role": user.role, "full_name": user.full_name}
    raise HTTPException(status_code=400, detail="Invalid OTP code.")

# ── Update operator phone number for 2FA ──────────────────────────────────
class UpdatePhoneRequest(BaseModel):
    phone_number: str

@app.put("/api/auth/update-phone")
def update_phone(request: UpdatePhoneRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    phone = request.phone_number.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required.")
    current_user.phone_number = phone
    db.commit()
    return {"status": "success", "message": "Phone number updated for 2FA."}

@app.get("/api/auth/me")
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "full_name": current_user.full_name, "role": current_user.role, "phone_number": current_user.phone_number or ""}

# --- Authentication API ---
@app.post("/api/auth/login")
async def login(form_data: UserLogin, db: Session = Depends(get_db)):
    import random, logging
    logger = logging.getLogger("uvicorn.error")
    logger.warning(f"LOGIN ATTEMPT - Username: '{form_data.username}'")
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password.")
    if user.locked_until and user.locked_until > datetime.datetime.utcnow():
        lock_mins = int((user.locked_until - datetime.datetime.utcnow()).total_seconds() / 60)
        raise HTTPException(status_code=400, detail=f"Account temporarily locked. Try again in {lock_mins + 1} minute(s).")
    if not verify_password(form_data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 3:
            user.locked_until = datetime.datetime.utcnow() + datetime.timedelta(minutes=30)
            db.commit()
            raise HTTPException(status_code=400, detail="Too many failed attempts. Account locked for 30 minutes.")
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid username or password.")

    # Password correct — reset lock
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    # If user has a phone number registered, trigger 2FA OTP
    if user.phone_number:
        otp = f"{random.randint(100000, 999999)}"
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
        LOGIN_OTP_STORE[user.username] = {"otp": otp, "expires_at": expires_at}
        message = f"Your Sri Tirumala Rice Mill login code is: {otp}. Valid for 5 minutes. Do not share."
        await SMSService.send_sms(user.phone_number, message)
        print(f"[Login 2FA OTP] Sent to {user.phone_number} for user {user.username}: {otp}")
        return {"otp_required": True, "username": user.username, "message": f"OTP sent to your registered number ending in {user.phone_number[-4:]}"}

    # No 2FA configured — issue JWT directly
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role, "full_name": user.full_name}

@app.get("/api/tokens", response_model=List[TokenResponse])
def get_tokens(db: Session = Depends(get_db)):
    # Same-day only tokens (6 AM to midnight)
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    return db.query(Token).filter(Token.created_at >= start_of_day).order_by(Token.created_at).all()

@app.post("/api/tokens", response_model=TokenResponse)
async def create_token(schema: UserCreate, db: Session = Depends(get_db)):
    # Mock endpoint for admin token creation
    # For actual client requests, webhooks or customer portal calls register_customer_token
    from backend.routes.webhooks import register_customer_token
    token = await register_customer_token(db, schema.username, False) # Using username as phone mapping
    await broadcast_queue_update()
    return token

@app.post("/api/tokens/call-next", response_model=TokenResponse)
async def call_next_token(action: TokenCallNext, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "staff"])
    
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    # 1. Fetch current active token on this counter and mark it served/done or skip it (no-show) automatically?
    # Actually, we let the staff mark served manually, but we can set any other 'active' token on this counter to served or keep it.
    
    # 2. Pick next waiting token: priority first, then FIFO
    next_token = db.query(Token).filter(
        Token.status == "waiting",
        Token.created_at >= start_of_day,
        Token.priority == True
    ).order_by(Token.created_at).first()
    
    if not next_token:
        next_token = db.query(Token).filter(
            Token.status == "waiting",
            Token.created_at >= start_of_day,
            Token.priority == False
        ).order_by(Token.created_at).first()
        
    if not next_token:
        raise HTTPException(status_code=404, detail="No waiting customers in the queue.")
        
    # Update token status
    next_token.status = "active"
    next_token.counter_assigned = action.counter
    next_token.called_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(next_token)
    
    # Send NOW ACTIVE SMS
    sms_text = SMSService.get_active_sms_text(next_token.token_number, action.counter)
    await SMSService.send_sms(next_token.phone_number, sms_text)
    
    # Alert next token in line (Position = 2) that they are 2 Away
    second_token = db.query(Token).filter(
        Token.status == "waiting",
        Token.created_at >= start_of_day
    ).order_by(Token.priority.desc(), Token.created_at).first()
    
    if second_token:
        # 2 Away Alert
        sec_wait = calculate_estimated_wait_time(db, 2)
        sec_sms = SMSService.get_2_away_sms_text(second_token.token_number, sec_wait)
        await SMSService.send_sms(second_token.phone_number, sec_sms)
        
    await broadcast_queue_update()
    return next_token

@app.post("/api/tokens/{token_id}/serve", response_model=TokenResponse)
async def serve_token(token_id: int, sale_input: SaleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "staff"])
    
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token or token.status != "active":
        raise HTTPException(status_code=400, detail="Token must be active to serve.")
        
    # Check inventory availability
    stock = db.query(Stock).filter(Stock.variety_name == sale_input.variety_name).first()
    if not stock:
        raise HTTPException(status_code=400, detail="Rice variety not found.")
        
    if stock.quantity_kg <= 0:
        raise HTTPException(status_code=400, detail="Stock is empty! Cannot sell this variety.")
        
    if stock.quantity_kg < sale_input.quantity_kg:
        raise HTTPException(status_code=400, detail=f"Insufficient stock! Available: {stock.quantity_kg} kg.")
        
    # Calculate price
    total_bill = sale_input.quantity_kg * stock.price_per_kg
    
    # Update inventory
    stock.quantity_kg -= sale_input.quantity_kg
    
    # Record sale
    service_sec = 0
    if token.called_at:
        service_sec = int((datetime.datetime.utcnow() - token.called_at).total_seconds())
        
    new_sale = Sale(
        token_id=token.id,
        variety_name=sale_input.variety_name,
        quantity_kg=sale_input.quantity_kg,
        total_price=total_bill,
        payment_mode=sale_input.payment_mode,
        service_time_seconds=service_sec,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_sale)
    
    # Complete token — also save customer name if provided
    token.status = "served"
    token.served_at = datetime.datetime.utcnow()
    if sale_input.customer_name:
        token.customer_name = sale_input.customer_name
    db.commit()
    db.refresh(token)
    
    # Send served SMS receipt
    sms_text = SMSService.get_served_sms_text(token.token_number, total_bill)
    await SMSService.send_sms(token.phone_number, sms_text)
    
    # Trigger low stock alert if below threshold
    if stock.quantity_kg < stock.low_stock_threshold:
        # In-app notifications are simulated, SMS is triggered
        owner = db.query(User).filter(User.role == "owner").first()
        alert_sms = SMSService.get_low_stock_sms_text(stock.variety_name, stock.quantity_kg, stock.low_stock_threshold)
        # Simulate SMS to owner (we can mock any number for owner)
        await SMSService.send_sms("+919999999999", alert_sms)
        
    await broadcast_queue_update()
    return token

@app.post("/api/tokens/{token_id}/no-show", response_model=TokenResponse)
async def mark_no_show(token_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "staff"])
    
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token or token.status != "active":
        raise HTTPException(status_code=400, detail="Token must be active to mark no-show.")
        
    token.status = "no_show"
    db.commit()
    db.refresh(token)
    
    # Send no-show SMS
    sms_text = SMSService.get_noshow_sms_text(token.token_number)
    await SMSService.send_sms(token.phone_number, sms_text)
    
    await broadcast_queue_update()
    return token

@app.post("/api/tokens/{token_id}/reactivate", response_model=TokenResponse)
async def reactivate_token(token_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "staff"])
    
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token or token.status != "no_show":
        raise HTTPException(status_code=400, detail="Only no-show tokens can be reactivated.")
        
    # Reactivate to waiting status at current FIFO (based on creation time)
    token.status = "waiting"
    token.called_at = None
    token.counter_assigned = None
    db.commit()
    db.refresh(token)
    
    # Re-calculate wait time
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    ahead = db.query(Token).filter(
        Token.status == "waiting",
        Token.created_at >= start_of_day,
        Token.created_at < token.created_at
    ).count()
    
    wait = calculate_estimated_wait_time(db, ahead + 1)
    sms_text = SMSService.get_token_sms_text(token.token_number, ahead, wait)
    await SMSService.send_sms(token.phone_number, sms_text)
    
    await broadcast_queue_update()
    return token

# --- Stock API ---
@app.get("/api/stock", response_model=List[StockResponse])
def get_stock(db: Session = Depends(get_db)):
    stocks = db.query(Stock).all()
    # Add auto-calculated bags count dynamically
    for s in stocks:
        s.bags_count = s.quantity_kg / 10.0 # Standard 10kg bags
    return stocks

@app.post("/api/stock", response_model=StockResponse)
def add_stock(stock_in: StockCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner"])
    
    existing = db.query(Stock).filter(Stock.variety_name == stock_in.variety_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Variety name already exists. Update it instead.")
        
    stock = Stock(
        variety_name=stock_in.variety_name,
        quantity_kg=stock_in.quantity_kg,
        price_per_kg=stock_in.price_per_kg,
        low_stock_threshold=stock_in.low_stock_threshold
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    
    # Log price history
    ph = PriceHistory(
        variety_name=stock.variety_name,
        old_price=0.0,
        new_price=stock.price_per_kg,
        changed_by=current_user.full_name
    )
    db.add(ph)
    db.commit()
    
    stock.bags_count = stock.quantity_kg / 10.0
    return stock

@app.put("/api/stock/{stock_id}", response_model=StockResponse)
def update_stock(stock_id: int, update: StockUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner"])
    
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock item not found.")
        
    old_price = stock.price_per_kg
    
    if update.quantity_kg is not None:
        stock.quantity_kg = update.quantity_kg
    if update.price_per_kg is not None:
        stock.price_per_kg = update.price_per_kg
    if update.low_stock_threshold is not None:
        stock.low_stock_threshold = update.low_stock_threshold
        
    db.commit()
    db.refresh(stock)
    
    # If price changed, log history
    if update.price_per_kg is not None and update.price_per_kg != old_price:
        ph = PriceHistory(
            variety_name=stock.variety_name,
            old_price=old_price,
            new_price=stock.price_per_kg,
            changed_by=current_user.full_name
        )
        db.add(ph)
        db.commit()
        
    stock.bags_count = stock.quantity_kg / 10.0
    return stock

# --- Reports & Analytics API ---
@app.get("/api/reports/daily", response_model=DailyReportResponse)
def get_daily_report(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "accountant"])
    
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    tokens = db.query(Token).filter(Token.created_at >= start_of_day).all()
    served = len([t for t in tokens if t.status == "served"])
    no_shows = len([t for t in tokens if t.status == "no_show"])
    no_show_rate = (no_shows / len(tokens) * 100.0) if tokens else 0.0
    
    sales = db.query(Sale).filter(Sale.created_at >= start_of_day).all()
    total_rev = sum(s.total_price for s in sales)
    
    payment_split = {"Cash": 0.0, "UPI": 0.0, "Credit": 0.0}
    for s in sales:
        payment_split[s.payment_mode] = payment_split.get(s.payment_mode, 0.0) + s.total_price
        
    stock_split = {}
    for s in sales:
        stock_split[s.variety_name] = stock_split.get(s.variety_name, 0.0) + s.quantity_kg
        
    return {
        "date": today.strftime("%d-%b-%Y"),
        "tokens_served": served,
        "no_shows": no_shows,
        "no_show_rate": no_show_rate,
        "total_revenue": total_rev,
        "payment_breakdown": payment_split,
        "stock_consumed": stock_split
    }

@app.get("/api/reports/customer-sales")
def get_customer_sales(date: str = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Returns all customer sale records for a given date (default: today).
    Each record contains: token number, customer name, phone number,
    rice variety, quantity kg, total amount, payment mode, time.
    Used for Excel export.
    """
    check_role(current_user, ["owner", "accountant"])
    
    if date:
        try:
            target_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            target_date = datetime.date.today()
    else:
        target_date = datetime.date.today()
    
    start_of_day = datetime.datetime.combine(target_date, datetime.time.min)
    end_of_day = datetime.datetime.combine(target_date, datetime.time.max)
    
    # Join sales with tokens to get phone number and customer name
    sales = db.query(Sale).filter(
        Sale.created_at >= start_of_day,
        Sale.created_at <= end_of_day
    ).order_by(Sale.created_at).all()
    
    records = []
    for idx, sale in enumerate(sales, start=1):
        token = db.query(Token).filter(Token.id == sale.token_id).first() if sale.token_id else None
        
        # IST = UTC + 5:30
        ist_time = sale.created_at + datetime.timedelta(hours=5, minutes=30)
        
        records.append({
            "sno": idx,
            "token_number": token.token_number if token else "-",
            "customer_name": (token.customer_name or "-") if token else "-",
            "phone_number": (token.phone_number or "-") if token else "-",
            "rice_variety": sale.variety_name,
            "quantity_kg": round(sale.quantity_kg, 2),
            "total_amount": round(sale.total_price, 2),
            "payment_mode": sale.payment_mode,
            "time": ist_time.strftime("%I:%M %p")
        })
    
    return {"date": target_date.strftime("%d-%b-%Y"), "records": records}

@app.get("/api/reports/trends")
def get_trends(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner", "accountant"])
    
    from sqlalchemy import func
    sales_count = db.query(Sale).count()
    
    if sales_count > 0:
        # Group by date (ignoring time) and sum total_price
        daily_sales = db.query(
            func.date(Sale.created_at).label("sales_date"),
            func.sum(Sale.total_price).label("revenue"),
            func.count(Sale.id).label("tokens")
        ).group_by(func.date(Sale.created_at)).order_by(func.date(Sale.created_at).desc()).limit(7).all()
        
        # Format the result. The database query returns them in desc order, we want asc chronological order
        weekly_revenue = []
        for row in reversed(daily_sales):
            try:
                date_obj = datetime.datetime.strptime(row.sales_date, "%Y-%m-%d")
                day_label = date_obj.strftime("%a") # e.g. Mon, Tue
            except Exception:
                day_label = row.sales_date
            
            weekly_revenue.append({
                "day": day_label,
                "revenue": float(row.revenue or 0.0),
                "tokens": int(row.tokens or 0)
            })
            
        # Aggregate peak hours dynamically from real sales
        hour_sales = db.query(
            func.strftime("%H", Sale.created_at).label("hour"),
            func.count(Sale.id).label("count")
        ).group_by(func.strftime("%H", Sale.created_at)).all()
        
        # Map hourly counts to standard time blocks
        time_blocks = {
            "06-08 AM": 0,
            "08-10 AM": 0,
            "10-12 PM": 0,
            "12-02 PM": 0,
            "02-04 PM": 0,
            "04-06 PM": 0,
            "06-08 PM": 0
        }
        for row in hour_sales:
            try:
                h = int(row.hour)
                if 6 <= h < 8: time_blocks["06-08 AM"] += row.count
                elif 8 <= h < 10: time_blocks["08-10 AM"] += row.count
                elif 10 <= h < 12: time_blocks["10-12 PM"] += row.count
                elif 12 <= h < 14: time_blocks["12-02 PM"] += row.count
                elif 14 <= h < 16: time_blocks["02-04 PM"] += row.count
                elif 16 <= h < 18: time_blocks["04-06 PM"] += row.count
                elif 18 <= h < 20: time_blocks["06-08 PM"] += row.count
            except Exception:
                pass
                
        peak_hours = [{"hour": k, "count": v} for k, v in time_blocks.items()]
        
        # Aggregate variety splits dynamically from real sales
        variety_sales = db.query(
            Sale.variety_name,
            func.sum(Sale.quantity_kg).label("total_qty")
        ).group_by(Sale.variety_name).all()
        
        varieties_split = [
            {"name": row.variety_name, "value": float(row.total_qty or 0.0)}
            for row in variety_sales
        ]
        
        return {
            "weekly_revenue": weekly_revenue,
            "peak_hours": peak_hours,
            "varieties_split": varieties_split
        }
        
    # Return empty real data if database has no sales yet
    return {
        "weekly_revenue": [],
        "peak_hours": [],
        "varieties_split": []
    }

# --- Settings API ---
@app.get("/api/settings", response_model=SystemSettingResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(SystemSetting).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found.")
    return settings

@app.put("/api/settings", response_model=SystemSettingResponse)
async def update_settings(update: SystemSettingUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner"])
    settings = db.query(SystemSetting).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found.")
        
    if update.mill_name is not None:
        settings.mill_name = update.mill_name
    if update.virtual_number is not None:
        settings.virtual_number = update.virtual_number
    if update.holiday_mode is not None:
        settings.holiday_mode = update.holiday_mode
    if update.queue_hold is not None:
        settings.queue_hold = update.queue_hold
    if update.avg_service_time is not None:
        settings.avg_service_time = update.avg_service_time
    if update.sms_gateway_active is not None:
        settings.sms_gateway_active = update.sms_gateway_active
        
    db.commit()
    db.refresh(settings)
    
    # Broadcast to all active clients (WebSockets)
    await broadcast_queue_update()
    return settings

@app.get("/api/stock/price-history")
def get_price_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner"])
    hist = db.query(PriceHistory).order_by(PriceHistory.changed_at.desc()).all()
    return [
        {
            "id": h.id,
            "variety_name": h.variety_name,
            "old_price": h.old_price,
            "new_price": h.new_price,
            "changed_by": h.changed_by,
            "changed_at": h.changed_at
        }
        for h in hist
    ]

@app.get("/api/users/security")
def get_security_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    check_role(current_user, ["owner"])
    users = db.query(User).all()
    return [
        {
            "username": u.username,
            "role": u.role,
            "full_name": u.full_name,
            "failed_attempts": u.failed_login_attempts,
            "is_locked": u.locked_until > datetime.datetime.utcnow() if u.locked_until else False,
            "locked_until": u.locked_until if u.locked_until else None
        }
        for u in users
    ]

# --- Bulk Stock Import API ---
@app.post("/api/stock/bulk-import")
async def bulk_import_stock(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    check_role(current_user, ["owner"])
    
    content = await file.read()
    text = content.decode('utf-8')
    csv_reader = csv.DictReader(io.StringIO(text))
    
    imported_count = 0
    updated_count = 0
    
    for row in csv_reader:
        try:
            variety = row.get("variety_name", "").strip()
            if not variety:
                continue
                
            qty = float(row.get("quantity_kg", 0.0))
            price = float(row.get("price_per_kg", 0.0))
            threshold = float(row.get("low_stock_threshold", 50.0))
            
            existing = db.query(Stock).filter(Stock.variety_name == variety).first()
            if existing:
                old_price = existing.price_per_kg
                existing.quantity_kg = qty
                existing.price_per_kg = price
                existing.low_stock_threshold = threshold
                
                # Log price change if different
                if price != old_price:
                    ph = PriceHistory(
                        variety_name=variety,
                        old_price=old_price,
                        new_price=price,
                        changed_by=current_user.full_name
                    )
                    db.add(ph)
                updated_count += 1
            else:
                new_stock = Stock(
                    variety_name=variety,
                    quantity_kg=qty,
                    price_per_kg=price,
                    low_stock_threshold=threshold
                )
                db.add(new_stock)
                
                ph = PriceHistory(
                    variety_name=variety,
                    old_price=0.0,
                    new_price=price,
                    changed_by=current_user.full_name
                )
                db.add(ph)
                imported_count += 1
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")
            
    db.commit()
    return {
        "status": "success",
        "imported": imported_count,
        "updated": updated_count
    }

# Include routers
app.include_router(webhook_router)

# Health endpoint
@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime_now_str()}
