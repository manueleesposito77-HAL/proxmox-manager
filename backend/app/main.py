import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from app.core.config import get_settings
from app.api.v1.cluster import router as cluster_router
from app.api.v1.auth import router as auth_router
from app.api.v1.audit import router as audit_router
from app.api.v1.console import router as console_router
from app.database import engine, Base, SessionLocal
from app.models.user import User
from app.models.cluster import Cluster  # import per creare tabella
from app.models.audit import AuditLog  # import per creare tabella
from app.core.security import hash_password

settings = get_settings()

# Wait for DB + create tables (retry loop per deployment fresh)
def wait_and_init_db(max_retries: int = 30, delay: int = 2):
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            print(f"[init] Database ready (attempt {attempt+1})")
            return
        except OperationalError as e:
            if attempt < max_retries - 1:
                print(f"[init] DB not ready yet ({attempt+1}/{max_retries}), retry in {delay}s...")
                time.sleep(delay)
            else:
                print(f"[init] DB init failed after {max_retries} attempts: {e}")
                raise

wait_and_init_db()

# Micro-migration: add columns se mancanti (evita Alembic per semplicità)
def run_migrations():
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE clusters ADD COLUMN IF NOT EXISTS fallback_hosts VARCHAR",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                print(f"[migration] skip: {e}")

run_migrations()

# Bootstrap admin di default
def bootstrap_admin():
    db: Session = SessionLocal()
    try:
        count = db.query(User).count()
        if count == 0:
            admin = User(
                username="admin",
                password_hash=hash_password("admin"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("[bootstrap] Creato admin default: admin/admin (CAMBIALA!)")
        else:
            print(f"[bootstrap] Utenti presenti ({count}), skip creazione admin")
    except Exception as e:
        print(f"[bootstrap] Errore: {e}")
    finally:
        db.close()

bootstrap_admin()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration: allow any origin (LXC deployment, access from any IP)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(cluster_router, prefix=f"{settings.API_V1_STR}/clusters", tags=["clusters"])
app.include_router(audit_router, prefix=f"{settings.API_V1_STR}/audit", tags=["audit"])
app.include_router(console_router, prefix=f"{settings.API_V1_STR}", tags=["console"])

@app.get("/")
def root():
    return {"message": "Welcome to Glu2k Proxmox Manager API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/v1/reset-admin")
def reset_admin_emergency(secret: str = ""):
    """Reset admin password di emergenza. Richiede SECRET_KEY come parametro."""
    if secret != settings.SECRET_KEY:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Invalid secret")
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(username="admin", password_hash=hash_password("admin"), role="admin", is_active=True)
            db.add(admin)
        else:
            admin.password_hash = hash_password("admin")
            admin.is_active = True
            admin.role = "admin"
        db.commit()
        return {"status": "ok", "message": "admin/admin ripristinato"}
    finally:
        db.close()
