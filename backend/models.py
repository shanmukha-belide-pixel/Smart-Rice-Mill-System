import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from backend.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False) # 'owner', 'staff', 'accountant'
    full_name = Column(String, nullable=False)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)

class Stock(Base):
    __tablename__ = "stock"
    
    id = Column(Integer, primary_key=True, index=True)
    variety_name = Column(String, unique=True, index=True, nullable=False)
    quantity_kg = Column(Float, default=0.0)
    price_per_kg = Column(Float, default=0.0)
    low_stock_threshold = Column(Float, default=50.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class PriceHistory(Base):
    __tablename__ = "price_history"
    
    id = Column(Integer, primary_key=True, index=True)
    variety_name = Column(String, index=True, nullable=False)
    old_price = Column(Float, nullable=False)
    new_price = Column(Float, nullable=False)
    changed_by = Column(String, nullable=False)
    changed_at = Column(DateTime, default=datetime.datetime.utcnow)

class Token(Base):
    __tablename__ = "tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token_number = Column(String, index=True, nullable=False) # e.g. T-001
    phone_number = Column(String, nullable=False)
    customer_name = Column(String, nullable=True) # Optional: recorded by staff when serving
    status = Column(String, index=True, default="waiting") # 'waiting', 'active', 'served', 'no_show', 'expired'
    priority = Column(Boolean, default=False)
    priority_reason = Column(String, nullable=True)
    counter_assigned = Column(String, nullable=True) # e.g. 'Counter 1'
    wait_time_minutes = Column(Integer, default=0)
    called_at = Column(DateTime, nullable=True)
    served_at = Column(DateTime, nullable=True)
    no_show_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

class Sale(Base):
    __tablename__ = "sales"
    
    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("tokens.id"), nullable=True)
    variety_name = Column(String, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    payment_mode = Column(String, nullable=False) # 'Cash', 'UPI', 'Credit'
    service_time_seconds = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    mill_name = Column(String, default="Sri Trimula Rice Mill")
    virtual_number = Column(String, default="+917075295440")
    holiday_mode = Column(Boolean, default=False)
    queue_hold = Column(Boolean, default=False)
    avg_service_time = Column(Integer, default=8)
    sms_gateway_active = Column(Boolean, default=True)

