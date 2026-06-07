import datetime
from fastapi import APIRouter, Depends, Form, HTTPException, Response
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Token, Stock, Sale
from backend.services.sms_service import SMSService
from typing import Optional

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

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
    # Calculate average service time of last 10 served tokens
    recent_sales = db.query(Sale).order_by(Sale.created_at.desc()).limit(10).all()
    if recent_sales:
        avg_service_time = sum(s.service_time_seconds for s in recent_sales) / len(recent_sales) / 60.0
    else:
        avg_service_time = 8.0 # Default 8 minutes
        
    # Cap between 3 and 20 mins per token
    avg_service_time = max(3.0, min(20.0, avg_service_time))
    return int(position * avg_service_time)

async def register_customer_token(db: Session, phone_number: str, priority: bool = False, priority_reason: str = None) -> Token:
    """
    Core token registration logic.
    Checks if token already exists for the caller today.
    """
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    # Check if this phone number already has an active or waiting token today
    existing = db.query(Token).filter(
        Token.phone_number == phone_number,
        Token.created_at >= start_of_day,
        Token.status.in_(["waiting", "active"])
    ).first()
    
    if existing:
        return existing
        
    # Generate new token
    token_num = get_next_token_number(db)
    
    # Find position (how many 'waiting' tokens are ahead)
    # Priority tokens are sorted first, then regular FIFO
    waiting_count = db.query(Token).filter(
        Token.status == "waiting",
        Token.created_at >= start_of_day
    ).count()
    
    wait_time = calculate_estimated_wait_time(db, waiting_count + 1)
    
    new_token = Token(
        token_number=token_num,
        phone_number=phone_number,
        status="waiting",
        priority=priority,
        priority_reason=priority_reason,
        wait_time_minutes=wait_time,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    
    # Send SMS notification
    sms_text = SMSService.get_token_sms_text(token_num, waiting_count, wait_time)
    await SMSService.send_sms(phone_number, sms_text)
    
    # Live broadcast to all active dashboards
    from backend.main_shared import broadcast_queue_update
    await broadcast_queue_update()
    
    return new_token

@router.post("/missed-call")
async def handle_missed_call(
    From: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Webhook for missed calls (Exotel/Twilio).
    Creates token for the caller, sends SMS, and returns Hangup XML.
    """
    # Clean phone number (standard format)
    phone = From.strip()
    
    # Register token
    await register_customer_token(db, phone)
    
    # Return TwiML XML to hang up the call immediately (zero cost to caller)
    twiml_response = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Response>\n'
        '    <Hangup/>\n'
        '</Response>'
    )
    return Response(content=twiml_response, media_type="application/xml")

@router.post("/sms")
async def handle_incoming_sms(
    From: str = Form(...),
    Body: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Webhook for SMS commands: TOKEN, PRICE, STATUS, STOP.
    """
    phone = From.strip()
    cmd = Body.strip().upper()
    
    today = datetime.date.today()
    start_of_day = datetime.datetime.combine(today, datetime.time.min)
    
    if cmd in ["TOKEN", "HI", "HELLO"]:
        # Register a new token
        token = await register_customer_token(db, phone)
        # Note: register_customer_token sends its own SMS, so we return empty/generic response or specific body
        return Response(content="Token registered", media_type="text/plain")
        
    elif cmd == "PRICE":
        # Fetch prices of all varieties
        items = db.query(Stock).all()
        if not items:
            reply = "Today's Prices @ Sri Trimula Rice Mill:\nNo prices listed today. Open 6 AM."
        else:
            lines = [f"{item.variety_name}: ₹{item.price_per_kg:.1f}/kg" for item in items]
            total_stock_bags = sum(item.quantity_kg for item in items) / 10.0 # e.g. 10kg bags
            reply = f"Today's Prices @ Sri Trimula Rice Mill:\n" + "\n".join(lines) + f"\nStock Status: Available"
            
        await SMSService.send_sms(phone, reply)
        return Response(content="Prices sent", media_type="text/plain")
        
    elif cmd == "STATUS":
        # Check customer's active token
        token = db.query(Token).filter(
            Token.phone_number == phone,
            Token.created_at >= start_of_day,
            Token.status.in_(["waiting", "active"])
        ).first()
        
        if not token:
            reply = "You do not have an active token today. SMS 'TOKEN' or give a missed call to register."
        elif token.status == "active":
            reply = f"Your token {token.token_number} is ACTIVE! Please proceed to {token.counter_assigned or 'Counter 1'} immediately."
        else:
            # Calculate position
            # Count how many waiting tokens have been created before this token
            ahead = db.query(Token).filter(
                Token.status == "waiting",
                Token.created_at >= start_of_day,
                Token.created_at < token.created_at
            ).count()
            wait = calculate_estimated_wait_time(db, ahead + 1)
            reply = f"Token {token.token_number}: {ahead} people ahead. Est. wait time: ~{wait} mins. - Sri Trimula Rice Mill"
            
        await SMSService.send_sms(phone, reply)
        return Response(content="Status sent", media_type="text/plain")
        
    elif cmd == "STOP":
        # Opt-out logic (simply delete or cancel active tokens)
        tokens = db.query(Token).filter(
            Token.phone_number == phone,
            Token.created_at >= start_of_day,
            Token.status.in_(["waiting", "active"])
        ).all()
        for t in tokens:
            t.status = "expired"
        db.commit()
        
        # Live broadcast to all active dashboards to clear expired tokens
        from backend.main_shared import broadcast_queue_update
        await broadcast_queue_update()
        
        reply = "You have been unsubscribed. Active tokens canceled. Sri Trimula Rice Mill."
        await SMSService.send_sms(phone, reply)
        return Response(content="Opt-out processed", media_type="text/plain")
        
    else:
        reply = "Invalid command. Supported: 'TOKEN' (register), 'PRICE' (rates), 'STATUS' (position), 'STOP' (cancel)."
        await SMSService.send_sms(phone, reply)
        return Response(content="Help sent", media_type="text/plain")
