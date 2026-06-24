import os
import json
import urllib.request
import datetime
from sqlalchemy.orm import Session
try:
    from backend.models import SystemSetting, Stock, Token, Sale
except ImportError:
    from models import SystemSetting, Stock, Token, Sale

MOCK_BIN_URL = "https://extendsclass.com/api/json-storage/bin/ccfedec"

def serialize_dt(dt):
    return dt.isoformat() if dt else None

def deserialize_dt(dt_str):
    if not dt_str:
        return None
    try:
        clean_str = dt_str.replace('Z', '+00:00')
        return datetime.datetime.fromisoformat(clean_str)
    except Exception:
        try:
            # SQLite format fallback
            return datetime.datetime.strptime(dt_str.split(".")[0], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return datetime.datetime.utcnow()

def backup_db(db: Session):
    try:
        print("[Cloud Sync] Backing up database to cloud...")
        
        # 1. Query all tables
        settings = db.query(SystemSetting).first()
        stocks = db.query(Stock).all()
        tokens = db.query(Token).all()
        sales = db.query(Sale).all()
        
        # 2. Serialize settings
        settings_data = None
        if settings:
            settings_data = {
                "id": settings.id,
                "mill_name": settings.mill_name,
                "virtual_number": settings.virtual_number,
                "holiday_mode": settings.holiday_mode,
                "queue_hold": settings.queue_hold,
                "avg_service_time": settings.avg_service_time,
                "sms_gateway_active": settings.sms_gateway_active
            }
            
        # 3. Serialize stocks
        stock_list = []
        for s in stocks:
            stock_list.append({
                "id": s.id,
                "variety_name": s.variety_name,
                "quantity_kg": s.quantity_kg,
                "price_per_kg": s.price_per_kg,
                "low_stock_threshold": s.low_stock_threshold
            })
            
        # 4. Serialize tokens
        token_list = []
        for t in tokens:
            token_list.append({
                "id": t.id,
                "token_number": t.token_number,
                "phone_number": t.phone_number,
                "customer_name": t.customer_name,
                "status": t.status,
                "priority": t.priority,
                "priority_reason": t.priority_reason,
                "counter_assigned": t.counter_assigned,
                "wait_time_minutes": t.wait_time_minutes,
                "called_at": serialize_dt(t.called_at),
                "served_at": serialize_dt(t.served_at),
                "no_show_at": serialize_dt(t.no_show_at),
                "created_at": serialize_dt(t.created_at)
            })
            
        # 5. Serialize sales
        sale_list = []
        for sl in sales:
            sale_list.append({
                "id": sl.id,
                "token_id": sl.token_id,
                "variety_name": sl.variety_name,
                "quantity_kg": sl.quantity_kg,
                "total_price": sl.total_price,
                "payment_mode": sl.payment_mode,
                "service_time_seconds": sl.service_time_seconds,
                "created_at": serialize_dt(sl.created_at)
            })
            
        payload = {
            "settings": settings_data,
            "stock": stock_list,
            "tokens": token_list,
            "sales": sale_list,
            "price_history": [],
            "sms_inbox": [],
            "logs": [],
            "locked_accounts": []
        }
        
        req = urllib.request.Request(
            MOCK_BIN_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            },
            method="PUT"
        )
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                print("[Cloud Sync] Database backup successful.")
            else:
                print(f"[Cloud Sync] Database backup failed. Status: {response.status}")
                
    except Exception as e:
        print(f"[Cloud Sync] Error during backup: {e}")

def restore_db(db: Session):
    try:
        sales_count = db.query(Sale).count()
        tokens_count = db.query(Token).count()
        
        is_empty = (sales_count == 0 and tokens_count == 0)
        
        if not is_empty:
            print("[Cloud Sync] Local database already contains data. Skipping cloud restore.")
            return
            
        print("[Cloud Sync] Fetching database backup from cloud...")
        req = urllib.request.Request(
            f"{MOCK_BIN_URL}?nocache={int(datetime.datetime.utcnow().timestamp())}",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                print(f"[Cloud Sync] Failed to fetch cloud backup. Status: {response.status}")
                return
                
            content = response.read().decode("utf-8")
            data = json.loads(content)
            
            if "data" in data and isinstance(data["data"], str):
                state = json.loads(data["data"])
            else:
                state = data
                
            if not state or not isinstance(state, dict):
                print("[Cloud Sync] Invalid cloud backup data.")
                return
                
            sales_data = state.get("sales", [])
            tokens_data = state.get("tokens", [])
            if not sales_data and not tokens_data:
                print("[Cloud Sync] Cloud backup has no records. Skipping restore.")
                return
                
            print(f"[Cloud Sync] Restoring {len(tokens_data)} tokens and {len(sales_data)} sales...")
            
            db.query(Sale).delete()
            db.query(Token).delete()
            db.query(Stock).delete()
            db.query(SystemSetting).delete()
            db.commit()
            
            s_data = state.get("settings")
            if s_data:
                settings = SystemSetting(
                    id=s_data.get("id", 1),
                    mill_name=s_data.get("mill_name", "Sri Tirumala Rice Mill"),
                    virtual_number=s_data.get("virtual_number", "+917075295440"),
                    holiday_mode=s_data.get("holiday_mode", False),
                    queue_hold=s_data.get("queue_hold", False),
                    avg_service_time=s_data.get("avg_service_time", 8),
                    sms_gateway_active=s_data.get("sms_gateway_active", True)
                )
                db.add(settings)
                
            for st in state.get("stock", []):
                stock = Stock(
                    id=st.get("id"),
                    variety_name=st.get("variety_name"),
                    quantity_kg=st.get("quantity_kg"),
                    price_per_kg=st.get("price_per_kg"),
                    low_stock_threshold=st.get("low_stock_threshold")
                )
                db.add(stock)
                
            for tk in tokens_data:
                token = Token(
                    id=tk.get("id"),
                    token_number=tk.get("token_number"),
                    phone_number=tk.get("phone_number"),
                    customer_name=tk.get("customer_name"),
                    status=tk.get("status"),
                    priority=tk.get("priority", False),
                    priority_reason=tk.get("priority_reason"),
                    counter_assigned=tk.get("counter_assigned"),
                    wait_time_minutes=tk.get("wait_time_minutes", 0),
                    called_at=deserialize_dt(tk.get("called_at")),
                    served_at=deserialize_dt(tk.get("served_at")),
                    no_show_at=deserialize_dt(tk.get("no_show_at")),
                    created_at=deserialize_dt(tk.get("created_at"))
                )
                db.add(token)
                
            for sl in sales_data:
                sale = Sale(
                    id=sl.get("id"),
                    token_id=sl.get("token_id"),
                    variety_name=sl.get("variety_name"),
                    quantity_kg=sl.get("quantity_kg"),
                    total_price=sl.get("total_price"),
                    payment_mode=sl.get("payment_mode"),
                    service_time_seconds=sl.get("service_time_seconds", 0),
                    created_at=deserialize_dt(sl.get("created_at"))
                )
                db.add(sale)
                
            db.commit()
            print("[Cloud Sync] Database restore successful.")
            
    except Exception as e:
        print(f"[Cloud Sync] Error during database restore: {e}")

def trigger_cloud_backup_task():
    try:
        from backend.database import SessionLocal
    except ImportError:
        from database import SessionLocal
    db = SessionLocal()
    try:
        backup_db(db)
    finally:
        db.close()

def trigger_backup():
    try:
        import threading
        threading.Thread(target=trigger_cloud_backup_task, daemon=True).start()
    except Exception as e:
        print(f"[Cloud Sync] Failed to trigger background backup: {e}")

