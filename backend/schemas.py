from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# User schemas
class UserBase(BaseModel):
    username: str
    role: str
    full_name: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenAuth(BaseModel):
    access_token: str
    token_type: str
    role: str
    full_name: str

class UserResponse(UserBase):
    id: int
    class Config:
        from_attributes = True

# Stock schemas
class StockBase(BaseModel):
    variety_name: str
    quantity_kg: float = Field(..., ge=0)
    price_per_kg: float = Field(..., ge=0)
    low_stock_threshold: float = Field(default=50.0, ge=0)

class StockCreate(StockBase):
    pass

class StockUpdate(BaseModel):
    quantity_kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    low_stock_threshold: Optional[float] = None

class StockResponse(StockBase):
    id: int
    bags_count: float # auto-calculated field
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# Token schemas
class TokenBase(BaseModel):
    token_number: str
    phone_number: str
    customer_name: Optional[str] = None
    status: str
    priority: bool
    priority_reason: Optional[str] = None
    counter_assigned: Optional[str] = None
    wait_time_minutes: int
    created_at: datetime

class TokenCreate(BaseModel):
    phone_number: str
    priority: Optional[bool] = False
    priority_reason: Optional[str] = None

class TokenCallNext(BaseModel):
    counter: str

class TokenResponse(TokenBase):
    id: int
    called_at: Optional[datetime] = None
    served_at: Optional[datetime] = None
    no_show_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Sales schemas
class SaleCreate(BaseModel):
    token_id: Optional[int] = None
    variety_name: str
    quantity_kg: float
    payment_mode: str # 'Cash', 'UPI', 'Credit'
    customer_name: Optional[str] = None # Name entered by staff when serving

class SaleResponse(BaseModel):
    id: int
    token_id: Optional[int]
    variety_name: str
    quantity_kg: float
    total_price: float
    payment_mode: str
    service_time_seconds: int
    created_at: datetime
    class Config:
        from_attributes = True

# Webhook schemas
class SMSCommandRequest(BaseModel):
    From: str # sender's number e.g. +919876543210
    Body: str # text e.g. "TOKEN" or "PRICE"

class MissedCallRequest(BaseModel):
    From: str # caller's number

# Report schemas
class DailyReportResponse(BaseModel):
    date: str
    tokens_served: int
    no_shows: int
    no_show_rate: float
    total_revenue: float
    payment_breakdown: dict # e.g. {"Cash": 100, "UPI": 200, "Credit": 50}
    stock_consumed: dict # e.g. {"Basmati": 50, "Sona Masuri": 100}
    avg_service_time: float

class CustomerSaleRecord(BaseModel):
    sno: int
    token_number: str
    customer_name: str
    phone_number: str
    rice_variety: str
    quantity_kg: float
    total_amount: float
    payment_mode: str
    time: str

# System Setting schemas
class SystemSettingBase(BaseModel):
    mill_name: str
    virtual_number: str
    holiday_mode: bool
    queue_hold: bool
    avg_service_time: int
    sms_gateway_active: bool

class SystemSettingUpdate(BaseModel):
    mill_name: Optional[str] = None
    virtual_number: Optional[str] = None
    holiday_mode: Optional[bool] = None
    queue_hold: Optional[bool] = None
    avg_service_time: Optional[int] = None
    sms_gateway_active: Optional[bool] = None

class SystemSettingResponse(SystemSettingBase):
    id: int
    class Config:
        from_attributes = True

