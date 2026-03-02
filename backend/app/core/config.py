from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Nexus Proxmox Manager"
    
    # Database
    DATABASE_URL: str = "postgresql://nexus:securepass@localhost:5432/nexus_db"
    
    # Security
    SECRET_KEY: str = "change_this_in_production_super_secret_key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Encryption (Fernet Key for sensitive data like Proxmox Tokens)
    # Generate one with: cryptography.fernet.Fernet.generate_key()
    ENCRYPTION_KEY: str 

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    class Config:
        case_sensitive = True
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()
