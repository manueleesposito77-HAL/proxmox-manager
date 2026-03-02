from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.cluster import Cluster
from app.services.proxmox_service import ProxmoxService
from typing import List

router = APIRouter()

@router.get("/vms/all")
def get_all_vms_across_clusters(db: Session = Depends(get_db)):
    """
    Recupera tutte le VM da tutti i cluster registrati nel database.
    """
    clusters = db.query(Cluster).filter(Cluster.is_active == True).all()
    all_vms = []

    for cluster in clusters:
        try:
            proxmox_svc = ProxmoxService(cluster)
            vms = proxmox_svc.get_all_vms()
            # Aggiunge informazioni sul cluster di appartenenza per la UI
            for vm in vms:
                vm["cluster_id"] = cluster.id
                vm["cluster_name"] = cluster.name
            all_vms.extend(vms)
        except Exception as e:
            # Continuiamo con gli altri cluster anche se uno fallisce
            print(f"Failed to fetch VMs from {cluster.name}: {e}")

    return {"total": len(all_vms), "vms": all_vms}

@router.post("/clusters")
def add_cluster(
    name: str, host: str, auth_user: str, auth_token: str, 
    auth_type: str = "token", db: Session = Depends(get_db)
):
    """
    Registrazione di un nuovo cluster (la cifratura avviene qui)
    """
    from app.core.config import get_settings
    from cryptography.fernet import Fernet
    
    settings = get_settings()
    cipher = Fernet(settings.ENCRYPTION_KEY)
    
    # Cifratura del token prima del salvataggio nel DB
    encrypted_token = cipher.encrypt(auth_token.encode()).decode()
    
    new_cluster = Cluster(
        name=name,
        host=host,
        auth_user=auth_user,
        auth_token=encrypted_token,
        auth_type=auth_type
    )
    
    db.add(new_cluster)
    db.commit()
    db.refresh(new_cluster)
    return new_cluster
