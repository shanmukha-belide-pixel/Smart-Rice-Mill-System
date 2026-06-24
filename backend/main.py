import os
import datetime
import jwt
import asyncio
import csv
import io
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Set, Optional

# Load environment variables from backend/.env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from backend.database import engine, Base, get_db
from backend.models import User, Token, Stock, Sale, PriceHistory, SystemSetting
from backend.schemas import UserCreate, UserLogin, TokenAuth, StockCreate, StockUpdate, StockResponse, TokenResponse, TokenCallNext, SaleCreate, SaleResponse, DailyReportResponse, SystemSettingResponse, SystemSettingUpdate
def datetime_now_str() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

from backend.main_shared import simulator_connections, broadcast_to_simulator, queue_connections, broadcast_queue_update

# Create database tables
Base.metadata.create_all(bind=engine)

# Run simple migration to ensure tokens table has customer_name column
def run_migrations():
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('tokens')]
    if 'customer_name' not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tokens ADD COLUMN customer_name TEXT"))
            print("Migration: Added customer_name column to tokens table.")

try:
    run_migrations()
except Exception as e:
    print(f"Migration error: {e}")


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
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "sritrimulamilkeysecret98765")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# queue_connections imported from main_shared

# Helper: Password Hashing Mock (using basic prefix/encoding for portability, or bcrypt if installed.
# We will use hashlib with salt for secure and clean zero-dep hashing to avoid installation hurdles on Windows)
import hashlib

# NOTE: salt must never be changed once passwords are stored in the DB
# Changing the salt invalidates all existing password hashes
PASSWORD_SALT = "sritrimulasalt"

def hash_password(password: str) -> str:
    return hashlib.sha256((password + PASSWORD_SALT).encode()).hexdigest()

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

def get_next_token_number(db: Session) -> str:
    """
    Generates next token number like T-001. Resets at midnight.
    """
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    count = db.query(Token).filter(Token.created_at >= start_of_day).count()
    return f"T-{count + 1:03d}"

def calculate_estimated_wait_time(db: Session, position: int) -> int:
    """
    Calculates wait time: position * avg_service_time (default 8 mins).
    """
    recent_sales = db.query(Sale).order_by(Sale.created_at.desc()).limit(10).all()
    if recent_sales:
        avg_service_time = sum(s.service_time_seconds for s in recent_sales) / len(recent_sales) / 60.0
    else:
        avg_service_time = 8.0
        
    avg_service_time = max(3.0, min(20.0, avg_service_time))
    return int(position * avg_service_time)

async def register_customer_token(db: Session, phone_number: str, priority: bool = False, priority_reason: str = None, customer_name: str = None) -> Optional[Token]:
    """
    Core token registration logic without SMS notification.
    """
    settings = db.query(SystemSetting).first()
    if settings and settings.holiday_mode:
        return None

    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    existing = db.query(Token).filter(
        Token.phone_number == phone_number,
        Token.created_at >= start_of_day,
        Token.status.in_(["waiting", "active"])
    ).first()
    
    if existing:
        return existing
        
    token_num = get_next_token_number(db)
    waiting_count = db.query(Token).filter(
        Token.status == "waiting",
        Token.created_at >= start_of_day
    ).count()
    
    wait_time = calculate_estimated_wait_time(db, waiting_count + 1)
    
    new_token = Token(
        token_number=token_num,
        phone_number=phone_number,
        customer_name=customer_name,
        status="waiting",
        priority=priority,
        priority_reason=priority_reason,
        wait_time_minutes=wait_time,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    
    # Live broadcast to all active dashboards
    await broadcast_queue_update()
    
    # Trigger cloud backup
    trigger_backup()
    
    return new_token

# Background task for checking no-show timers (5 minutes timeout) without SMS triggers
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
                            
                    await broadcast_queue_update()
        except Exception as e:
            print(f"Error in auto-skip loop: {e}")
        finally:
            db.close()
        await asyncio.sleep(10)


def trigger_backup():
    try:
        try:
            from backend.services.cloud_sync import trigger_cloud_backup_task
        except ImportError:
            from services.cloud_sync import trigger_cloud_backup_task
        import threading
        threading.Thread(target=trigger_cloud_backup_task, daemon=True).start()
    except Exception as e:
        print(f"[Cloud Sync] Failed to trigger background backup: {e}")

# Startup Seeding
@app.on_event("startup")
def seed_users():
    migrate_and_seed()
    
    # Start background loops
    asyncio.create_task(auto_skip_no_shows_loop())
    
    db = next(get_db())
    
    # 1. Seed Shanmukha owner user first
    try:
        # Delete default users
        db.query(User).filter(User.username.in_(["owner", "staff", "accountant"])).delete(synchronize_session=False)
        db.commit()
        
        # Ensure Shanmukha is present and has the correct password hash
        shanmukha = db.query(User).filter(User.username == "Shanmukha").first()
        expected_hash = hash_password("Shanmukha29*")
        if not shanmukha:
            new_user = User(
                username="Shanmukha",
                password_hash=expected_hash,
                role="owner",
                full_name="Shanmukha"
            )
            db.add(new_user)
            db.commit()
            print("Successfully seeded owner user Shanmukha.")
        elif shanmukha.password_hash != expected_hash:
            shanmukha.password_hash = expected_hash
            db.commit()
            print("Successfully updated owner user Shanmukha password hash to match current salt.")
    except Exception as e:
        print(f"Error seeding Shanmukha: {e}")
        
    # 2. Try restoring from cloud bin
    try:
        try:
            from backend.services.cloud_sync import restore_db
        except ImportError:
            from services.cloud_sync import restore_db
        restore_db(db)
    except Exception as e:
        print(f"Error during restore_db: {e}")
        
    # 3. Seed default stock and sales
    try:
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
            
        # Seed default sales for the last 7 days if no historical sales exist
        import datetime
        today_start = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        has_historical_sales = db.query(Sale).filter(Sale.created_at < today_start).count() > 0
        if not has_historical_sales:
            import random
            varieties = [
                {"name": "Basmati", "price": 120.0},
                {"name": "Sona Masuri", "price": 95.0},
                {"name": "Sharbati", "price": 110.0}
            ]
            payment_modes = ["Cash", "UPI", "Card"]
            now = datetime.datetime.utcnow()
            
            for i in range(6, -1, -1):
                target_date = now - datetime.timedelta(days=i)
                num_sales = 3 if i == 0 else random.randint(2, 4)
                for j in range(num_sales):
                    sale_time = target_date.replace(hour=4 + j*2 + random.randint(0, 1), minute=random.randint(0, 59))
                    variety = random.choice(varieties)
                    weight = random.randint(50, 150)
                    total_price = weight * variety["price"]
                    
                    sale = Sale(
                        token_id=None,
                        variety_name=variety["name"],
                        quantity_kg=float(weight),
                        total_price=float(total_price),
                        payment_mode=random.choice(payment_modes),
                        service_time_seconds=random.randint(240, 600),
                        created_at=sale_time
                    )
                    db.add(sale)
            db.commit()
            trigger_backup()
            print("Successfully seeded historical sales data.")
    except Exception as e:
        print(f"Error seeding stock/sales: {e}")
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



@app.get("/api/auth/me")
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "full_name": current_user.full_name, "role": current_user.role, "phone_number": current_user.phone_number or ""}

# --- Authentication API ---
@app.post("/api/auth/login")
async def login(form_data: UserLogin, db: Session = Depends(get_db)):
    import logging
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

    # Direct login - issue JWT directly
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
    token = await register_customer_token(db, schema.username, False, customer_name=schema.full_name) # Using username as phone mapping
    await broadcast_queue_update()
    return token

class CustomerTokenRegisterSchema(BaseModel):
    phone_number: str
    customer_name: Optional[str] = None

@app.post("/api/tokens/register", response_model=TokenResponse)
async def register_portal_token(schema: CustomerTokenRegisterSchema, db: Session = Depends(get_db)):
    token = await register_customer_token(
        db, 
        schema.phone_number, 
        priority=False, 
        customer_name=schema.customer_name
    )
    if token is None:
        raise HTTPException(status_code=400, detail="Closed today (holiday mode is active).")
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
    trigger_backup()
    
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
    trigger_backup()
    
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
    trigger_backup()
    
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
    trigger_backup()
    
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
    trigger_backup()
    
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
        
    trigger_backup()
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
    trigger_backup()
    
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
    trigger_backup()
    return {
        "status": "success",
        "imported": imported_count,
        "updated": updated_count
    }

# Include routers

# Health endpoint
@app.get("/health")
def health():
    return {"status": "healthy", "timestamp": datetime_now_str()}

@app.get("/api/auth/debug-users")
def debug_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"username": u.username, "role": u.role, "password_hash": u.password_hash} for u in users]

@app.get("/api/auth/force-seed-users")
def force_seed_users(db: Session = Depends(get_db)):
    try:
        db.query(User).filter(User.username.in_(["owner", "staff", "accountant"])).delete(synchronize_session=False)
        db.commit()
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
            return {"status": "success", "message": "Seeded Shanmukha from scratch."}
        else:
            shanmukha.password_hash = hash_password("Shanmukha29*")
            shanmukha.role = "owner"
            db.commit()
            return {"status": "success", "message": "Updated Shanmukha password."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
