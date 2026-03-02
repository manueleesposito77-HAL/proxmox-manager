from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    host = Column(String, nullable=False)
    port = Column(Integer, default=8006)
    
    # Auth
    auth_user = Column(String, nullable=False) # e.g., root@pam or API Token ID
    auth_token = Column(String, nullable=False) # Encrypted password or API Token Secret
    auth_type = Column(String, default="token") # "token" or "password"
    
    verify_ssl = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
