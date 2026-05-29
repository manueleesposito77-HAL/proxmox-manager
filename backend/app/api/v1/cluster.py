from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.cluster import Cluster
from app.models.user import User
from app.schemas.cluster import ClusterCreate, ClusterResponse, ClusterUpdate
from app.services.proxmox_service import ProxmoxService
from app.core.config import get_settings
from app.core.security import require_any, require_admin, require_operator_or_admin, get_current_user
from app.core.audit import log_action
from cryptography.fernet import Fernet
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.core.cache import cache_get, cache_set, cache_key

router = APIRouter(dependencies=[Depends(require_any)])
settings = get_settings()
cipher = Fernet(settings.ENCRYPTION_KEY)

@router.get("/", response_model=List[ClusterResponse])
def list_clusters(db: Session = Depends(get_db)):
    return db.query(Cluster).all()

@router.post("/", response_model=ClusterResponse, dependencies=[Depends(require_admin)])
def add_cluster(cluster_in: ClusterCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    encrypted_token = cipher.encrypt(cluster_in.auth_token.encode()).decode()
    db_cluster = Cluster(
        name=cluster_in.name, host=cluster_in.host,
        fallback_hosts=cluster_in.fallback_hosts,
        port=cluster_in.port,
        auth_user=cluster_in.auth_user, auth_token=encrypted_token,
        auth_type=cluster_in.auth_type, verify_ssl=cluster_in.verify_ssl
    )
    db.add(db_cluster)
    db.commit()
    db.refresh(db_cluster)
    log_action(db, request, user, "cluster_create", "cluster", db_cluster.id,
               {"name": db_cluster.name, "host": db_cluster.host})
    return db_cluster

@router.put("/{cluster_id}", response_model=ClusterResponse, dependencies=[Depends(require_admin)])
def update_cluster(cluster_id: int, cluster_in: ClusterUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    data = cluster_in.model_dump(exclude_unset=True)
    if "auth_token" in data:
        if data["auth_token"]:
            data["auth_token"] = cipher.encrypt(data["auth_token"].encode()).decode()
        else:
            del data["auth_token"]
    for k, v in data.items():
        setattr(cluster, k, v)
    db.commit()
    db.refresh(cluster)
    log_action(db, request, user, "cluster_update", "cluster", cluster.id,
               {"name": cluster.name, "changes": list(data.keys())})
    return cluster


@router.delete("/{cluster_id}", dependencies=[Depends(require_admin)])
def delete_cluster(cluster_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    name = cluster.name
    db.delete(cluster)
    db.commit()
    log_action(db, request, user, "cluster_delete", "cluster", cluster_id, {"name": name})
    return {"status": "deleted"}


def _get_cluster_or_404(cluster_id: int, db: Session) -> Cluster:
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return cluster


@router.get("/{cluster_id}/vms")
def list_cluster_vms(cluster_id: int, db: Session = Depends(get_db)):
    ck = cache_key("vms", cluster_id)
    hit = cache_get(ck)
    if hit:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        data = svc.get_all_vms()
        cache_set(ck, data, ttl=5)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes")
def list_cluster_nodes(cluster_id: int, db: Session = Depends(get_db)):
    ck = cache_key("nodes", cluster_id)
    hit = cache_get(ck)
    if hit:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        data = svc.proxmox.nodes.get()
        cache_set(ck, data, ttl=8)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/action", dependencies=[Depends(require_admin)])
def node_action(cluster_id: int, node: str, action: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Shutdown o reboot del nodo Proxmox."""
    if action not in ("shutdown", "reboot"):
        raise HTTPException(status_code=400, detail="Invalid action (shutdown|reboot)")
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.nodes(node).status.post(command=action)
        log_action(db, request, user, f"node_{action}", "node", node,
                   {"cluster": cluster.name})
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/overview")
def cluster_overview(cluster_id: int, timeframe: str = "hour", db: Session = Depends(get_db)):
    """Dati aggregati cluster: nodes, vms, storage, rrddata per nodo."""
    ck = cache_key("overview", cluster_id, timeframe)
    hit = cache_get(ck)
    if hit:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)

        # Fase 1: fetch rapido in parallelo (tutto via cluster.resources + nodes)
        nodes = svc.proxmox.nodes.get()
        vms = svc.get_all_vms()

        # Storage via cluster.resources (0.02s) anziché nodes(n).storage.get() (13s+)
        raw_storage = svc.proxmox.cluster.resources.get(type="storage")
        storage = []
        for s in raw_storage:
            storage.append({
                "storage": s.get("storage"),
                "node": s.get("node"),
                "type": s.get("plugintype", ""),
                "content": s.get("content", ""),
                "used": s.get("disk", 0),
                "total": s.get("maxdisk", 0),
                "active": 1 if s.get("status") == "available" else 0,
                "enabled": 1,
                "shared": s.get("shared", 0),
            })

        # Fase 2: rrddata per nodi online
        online_nodes = [n for n in nodes if n.get("status") == "online"]
        rrddata = {}
        for n in online_nodes:
            try:
                rrddata[n["node"]] = svc.proxmox.nodes(n["node"]).rrddata.get(timeframe=timeframe)
            except:
                rrddata[n["node"]] = []

        result = {"nodes": nodes, "vms": vms, "storage": storage, "rrddata": rrddata}
        cache_set(ck, result, ttl=5)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/status")
def node_status(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).status.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/summary")
def node_summary(cluster_id: int, node: str, timeframe: str = "hour", db: Session = Depends(get_db)):
    """Dati aggregati del nodo: status, storage, updates, network, rrddata, vms."""
    ck = cache_key("node_summary", cluster_id, node, timeframe)
    hit = cache_get(ck)
    if hit:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)

        status = svc.proxmox.nodes(node).status.get()
        vms_all = svc.get_all_vms()
        vms = [v for v in vms_all if v.get("node") == node]

        # Storage via cluster.resources (veloce, evita timeout su storage offline)
        raw_storage = svc.proxmox.cluster.resources.get(type="storage")
        storage = []
        for s in raw_storage:
            if s.get("node") == node:
                storage.append({
                    "storage": s.get("storage"),
                    "node": s.get("node"),
                    "type": s.get("plugintype", ""),
                    "content": s.get("content", ""),
                    "used": s.get("disk", 0),
                    "total": s.get("maxdisk", 0),
                    "active": 1 if s.get("status") == "available" else 0,
                    "enabled": 1,
                    "shared": s.get("shared", 0),
                })

        try: updates = svc.proxmox.nodes(node).apt.update.get()
        except: updates = []
        try: network = svc.proxmox.nodes(node).network.get()
        except: network = []
        try: rrddata = svc.proxmox.nodes(node).rrddata.get(timeframe=timeframe)
        except: rrddata = []

        result = {"status": status, "storage": storage, "updates": updates,
                  "network": network, "rrddata": rrddata, "vms": vms}
        cache_set(ck, result, ttl=5)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/storage/{storage}/content")
def node_storage_content(cluster_id: int, node: str, storage: str, content_type: str = None, db: Session = Depends(get_db)):
    """Lista contenuto di uno storage (iso, vztmpl, images, rootdir, backup)."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        kwargs = {}
        if content_type:
            kwargs["content"] = content_type
        return svc.proxmox.nodes(node).storage(storage).content.get(**kwargs)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/qemu/create", dependencies=[Depends(require_operator_or_admin)])
def create_qemu_vm(cluster_id: int, node: str, payload: dict, db: Session = Depends(get_db)):
    """Crea una nuova VM QEMU."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        task = svc.proxmox.nodes(node).qemu.create(**clean)
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/lxc/create", dependencies=[Depends(require_operator_or_admin)])
def create_lxc_ct(cluster_id: int, node: str, payload: dict, db: Session = Depends(get_db)):
    """Crea un nuovo LXC container."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        task = svc.proxmox.nodes(node).lxc.create(**clean)
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/aplinfo")
def node_aplinfo(cluster_id: int, node: str, db: Session = Depends(get_db)):
    """Catalogo template disponibili (Proxmox + TurnKey)."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).aplinfo.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/aplinfo/download", dependencies=[Depends(require_admin)])
def node_aplinfo_download(cluster_id: int, node: str, payload: dict, db: Session = Depends(get_db)):
    """Scarica un template dal catalogo Proxmox/TurnKey. payload: {storage, template}"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        task = svc.proxmox.nodes(node).aplinfo.post(storage=payload["storage"], template=payload["template"])
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/storage/{storage}/download-url", dependencies=[Depends(require_admin)])
def storage_download_url(cluster_id: int, node: str, storage: str, payload: dict, db: Session = Depends(get_db)):
    """Scarica un file (iso/vztmpl) da URL dentro uno storage. payload: {url, filename, content}"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        kwargs = {
            "url": payload["url"],
            "filename": payload["filename"],
            "content": payload.get("content", "iso"),
        }
        if payload.get("checksum"):
            kwargs["checksum"] = payload["checksum"]
            kwargs["checksum-algorithm"] = payload.get("checksum_algo", "sha256")
        task = svc.proxmox.nodes(node).storage(storage)("download-url").post(**kwargs)
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/backups")
def node_backups(cluster_id: int, node: str, storage: str = None, vmid: int = None, db: Session = Depends(get_db)):
    """Lista backup del nodo (tutti gli storage o filtrati)."""
    ck = cache_key("backups", cluster_id, node, storage or "", vmid or "")
    hit = cache_get(ck)
    if hit is not None:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        if storage:
            stores = [storage]
        else:
            # cluster.resources è veloce, evita timeout su storage offline
            raw = svc.proxmox.cluster.resources.get(type="storage")
            stores = [s["storage"] for s in raw if s.get("node") == node and s.get("status") == "available" and "backup" in (s.get("content") or "")]
        results = []
        for s in stores:
            try:
                content = svc.proxmox.nodes(node).storage(s).content.get(content="backup")
                for c in content:
                    c["_storage"] = s
                    if vmid is None or c.get("vmid") == vmid:
                        results.append(c)
            except Exception:
                continue
        results.sort(key=lambda x: x.get("ctime", 0), reverse=True)
        cache_set(ck, results, ttl=15)
        return results
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/backup", dependencies=[Depends(require_operator_or_admin)])
def vm_create_backup(cluster_id: int, node: str, vmid: int, payload: dict, db: Session = Depends(get_db)):
    """Crea backup on-demand di una VM/CT.
    payload: {storage, mode (snapshot/suspend/stop), compress (zstd/lzo/gzip), notes, remove(0/1), mailto}"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        kwargs = {
            "vmid": vmid,
            "storage": payload["storage"],
            "mode": payload.get("mode", "snapshot"),
            "compress": payload.get("compress", "zstd"),
            "remove": payload.get("remove", 0),
        }
        if payload.get("notes"):
            kwargs["notes-template"] = payload["notes"]
        if payload.get("mailto"):
            kwargs["mailto"] = payload["mailto"]
        task = svc.proxmox.nodes(node).vzdump.post(**kwargs)
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{cluster_id}/nodes/{node}/backups", dependencies=[Depends(require_operator_or_admin)])
def delete_backup(cluster_id: int, node: str, volid: str, db: Session = Depends(get_db)):
    """Elimina un backup. volid = 'storage:backup/vzdump-qemu-100-...vma.zst'"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        # Extract storage from volid
        storage = volid.split(":")[0]
        svc.proxmox.nodes(node).storage(storage).content(volid).delete()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/restore", dependencies=[Depends(require_admin)])
def restore_backup(cluster_id: int, node: str, payload: dict, db: Session = Depends(get_db)):
    """Ripristina un backup in una nuova VM/CT.
    payload: {vmid, volid, type (qemu/lxc), storage, force (0/1), start (0/1), hostname, name}"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        vtype = payload.get("type", "qemu")
        kwargs = {
            "vmid": int(payload["vmid"]),
            "force": int(payload.get("force", 0)),
            "start": int(payload.get("start", 0)),
        }
        if vtype == "lxc":
            kwargs["ostemplate"] = payload["volid"]
            kwargs["restore"] = 1
            if payload.get("storage"):
                kwargs["rootfs"] = f"{payload['storage']}:0"
            if payload.get("hostname"):
                kwargs["hostname"] = payload["hostname"]
            task = svc.proxmox.nodes(node).lxc.post(**kwargs)
        else:
            kwargs["archive"] = payload["volid"]
            if payload.get("storage"):
                kwargs["storage"] = payload["storage"]
            if payload.get("name"):
                kwargs["name"] = payload["name"]
            task = svc.proxmox.nodes(node).qemu.post(**kwargs)
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/next_vmid")
def next_vmid(cluster_id: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return {"vmid": svc.proxmox.cluster.nextid.get()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/storage")
def node_storage(cluster_id: int, node: str, db: Session = Depends(get_db)):
    ck = cache_key("node_storage", cluster_id, node)
    hit = cache_get(ck)
    if hit is not None:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        # cluster.resources è molto più veloce di nodes(node).storage.get()
        # (evita timeout su storage NFS/PBS offline)
        raw = svc.proxmox.cluster.resources.get(type="storage")
        data = []
        for s in raw:
            if s.get("node") == node:
                data.append({
                    "storage": s.get("storage"),
                    "node": s.get("node"),
                    "type": s.get("plugintype", ""),
                    "content": s.get("content", ""),
                    "used": s.get("disk", 0),
                    "total": s.get("maxdisk", 0),
                    "active": 1 if s.get("status") == "available" else 0,
                    "enabled": 1,
                    "shared": s.get("shared", 0),
                })
        cache_set(ck, data, ttl=10)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/disks")
def node_disks(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).disks.list.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/updates")
def node_updates(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).apt.update.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/updates/refresh", dependencies=[Depends(require_admin)])
def node_updates_refresh(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        task = svc.proxmox.nodes(node).apt.update.post()
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/services")
def node_services(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).services.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/storage")
def cluster_storage(cluster_id: int, db: Session = Depends(get_db)):
    """Storage del cluster (risorse aggregate tra nodi)."""
    ck = cache_key("storage", cluster_id)
    hit = cache_get(ck)
    if hit:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        data = svc.proxmox.cluster.resources.get(type="storage")
        cache_set(ck, data, ttl=10)
        return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/tasks")
def cluster_tasks(cluster_id: int, limit: int = 50, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        tasks = svc.proxmox.cluster.tasks.get()
        return tasks[:limit] if isinstance(tasks, list) else tasks
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/tasks")
def node_tasks(cluster_id: int, node: str, limit: int = 50, vmid: int = None, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        params = {"limit": limit}
        if vmid is not None:
            params["vmid"] = vmid
        return svc.proxmox.nodes(node).tasks.get(**params)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/tasks/{upid}/log")
def task_log(cluster_id: int, node: str, upid: str, start: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).tasks(upid).log.get(start=start, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/tasks/{upid}/status")
def task_status(cluster_id: int, node: str, upid: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).tasks(upid).status.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/create-wizard-data")
def create_wizard_data(cluster_id: int, node: str, kind: str = "lxc", db: Session = Depends(get_db)):
    """Dati aggregati per il wizard creazione VM/CT: vmid, storage, network, template/ISO."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        result = {}

        def fetch_vmid():
            result["vmid"] = svc.proxmox.cluster.nextid.get()

        def fetch_storage():
            result["storage"] = svc.proxmox.nodes(node).storage.get()

        def fetch_network():
            result["network"] = svc.proxmox.nodes(node).network.get()

        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(f) for f in [fetch_vmid, fetch_storage, fetch_network]]
            for f in as_completed(futures):
                f.result()  # raise if error

        # Fetch contenuti template/ISO in parallelo
        wanted = "vztmpl" if kind == "lxc" else "iso"
        content_stores = [s for s in result["storage"] if s.get("active") and wanted in (s.get("content") or "")]

        def fetch_content(store_name):
            try:
                items = svc.proxmox.nodes(node).storage(store_name).content.get(content=wanted)
                return [{"_storage": store_name, **item} for item in items]
            except Exception:
                return []

        contents = []
        if content_stores:
            with ThreadPoolExecutor(max_workers=min(len(content_stores), 6)) as pool:
                futures = [pool.submit(fetch_content, s["storage"]) for s in content_stores]
                for f in as_completed(futures):
                    contents.extend(f.result())

        result["contents"] = contents
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/firewall/log")
def node_firewall_log(cluster_id: int, node: str, limit: int = 100, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).firewall.log.get(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/syslog")
def node_syslog(cluster_id: int, node: str, limit: int = 100, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).syslog.get(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/rrddata")
def node_rrddata(cluster_id: int, node: str, timeframe: str = "hour", db: Session = Depends(get_db)):
    """Dati storici del nodo (cpu, memoria, rete, disco). timeframe: hour/day/week/month/year"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).rrddata.get(timeframe=timeframe, cf="AVERAGE")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/network/{iface}")
def node_network_get(cluster_id: int, node: str, iface: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).network(iface).get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/nodes/{node}/network")
def node_network(cluster_id: int, node: str, db: Session = Depends(get_db)):
    """Lista interfacce di rete del nodo (bridges, bonds, physical)."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.nodes(node).network.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/network", dependencies=[Depends(require_admin)])
def node_network_create(cluster_id: int, node: str, payload: dict, db: Session = Depends(get_db)):
    """Crea una nuova interfaccia (es. bridge). Applica modifiche."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.nodes(node).network.post(**payload)
        # Apply pending changes
        try:
            svc.proxmox.nodes(node).network.put()
        except Exception:
            pass
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/nodes/{node}/network/{iface}", dependencies=[Depends(require_admin)])
def node_network_update(cluster_id: int, node: str, iface: str, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.nodes(node).network(iface).put(**payload)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{cluster_id}/nodes/{node}/network/{iface}", dependencies=[Depends(require_admin)])
def node_network_delete(cluster_id: int, node: str, iface: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.nodes(node).network(iface).delete()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/network/apply", dependencies=[Depends(require_admin)])
def node_network_apply(cluster_id: int, node: str, db: Session = Depends(get_db)):
    """Applica le modifiche di rete pending (reload ifupdown2)."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        task = svc.proxmox.nodes(node).network.put()
        return {"status": "ok", "task_id": task}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/nodes/{node}/network/revert", dependencies=[Depends(require_admin)])
def node_network_revert(cluster_id: int, node: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.nodes(node).network.delete()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---- Firewall (cluster-level) ----
@router.get("/{cluster_id}/firewall/rules")
def fw_cluster_rules(cluster_id: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.cluster.firewall.rules.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/firewall/rules", dependencies=[Depends(require_admin)])
def fw_cluster_add_rule(cluster_id: int, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        svc.proxmox.cluster.firewall.rules.post(**clean)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/firewall/rules/{pos}", dependencies=[Depends(require_admin)])
def fw_cluster_move_rule(cluster_id: int, pos: int, payload: dict, db: Session = Depends(get_db)):
    """Sposta/modifica una regola. payload={moveto: N} per riordinare."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        # Campi vuoti → lista per parametro 'delete' di Proxmox
        to_delete = [k for k, v in payload.items() if (v is None or v == "") and k not in ("moveto", "delete")]
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        if to_delete:
            clean["delete"] = ",".join(to_delete)
        svc.proxmox.cluster.firewall.rules(pos).put(**clean)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{cluster_id}/firewall/rules/{pos}", dependencies=[Depends(require_admin)])
def fw_cluster_del_rule(cluster_id: int, pos: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        svc.proxmox.cluster.firewall.rules(pos).delete()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/firewall/options")
def fw_cluster_options(cluster_id: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        return svc.proxmox.cluster.firewall.options.get()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/firewall/options", dependencies=[Depends(require_admin)])
def fw_cluster_set_options(cluster_id: int, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        svc.proxmox.cluster.firewall.options.put(**clean)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/firewall/log")
def fw_cluster_log(cluster_id: int, limit: int = 200, db: Session = Depends(get_db)):
    """Log firewall aggregato da tutti i nodi del cluster."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        nodes = svc.proxmox.nodes.get()
        all_logs = []

        def fetch_node_log(node_name):
            try:
                entries = svc.proxmox.nodes(node_name).firewall.log.get(limit=limit)
                return [(node_name, e) for e in entries if e.get("t") and e["t"] != "no content"]
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=min(len(nodes), 8)) as pool:
            futures = {pool.submit(fetch_node_log, n["node"]): n["node"] for n in nodes}
            for f in as_completed(futures):
                all_logs.extend(f.result())

        # Ordina per numero sequenza decrescente (più recenti prima) con nodo come tiebreaker
        all_logs.sort(key=lambda x: x[1].get("n", 0), reverse=True)
        return [{"node": node, "n": entry["n"], "t": entry["t"]} for node, entry in all_logs]
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/firewall/log-level", dependencies=[Depends(require_admin)])
def fw_cluster_set_log_level(cluster_id: int, payload: dict, db: Session = Depends(get_db)):
    """Imposta log_level_in/out su tutte le VM/CT del cluster."""
    cluster = _get_cluster_or_404(cluster_id, db)
    level = payload.get("level", "info")  # info, nolog, warning, err, debug
    direction = payload.get("direction", "both")  # in, out, both
    try:
        svc = ProxmoxService(cluster)
        vms = svc.get_all_vms()
        results = {"ok": 0, "errors": 0, "details": []}

        def apply_log_level(vm):
            node = vm.get("node")
            vmid = vm.get("vmid")
            vtype = vm.get("type", "qemu")
            try:
                if vtype == "lxc":
                    handle = svc.proxmox.nodes(node).lxc(vmid)
                else:
                    handle = svc.proxmox.nodes(node).qemu(vmid)
                opts = {}
                if direction in ("in", "both"):
                    opts["log_level_in"] = level
                if direction in ("out", "both"):
                    opts["log_level_out"] = level
                handle.firewall.options.put(**opts)
                return {"vmid": vmid, "node": node, "status": "ok"}
            except Exception as e:
                return {"vmid": vmid, "node": node, "status": "error", "detail": str(e)}

        with ThreadPoolExecutor(max_workers=min(len(vms), 8)) as pool:
            futures = [pool.submit(apply_log_level, vm) for vm in vms]
            for f in as_completed(futures):
                r = f.result()
                if r["status"] == "ok":
                    results["ok"] += 1
                else:
                    results["errors"] += 1
                results["details"].append(r)

        results["total"] = len(vms)
        return results
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def _vm_handle(svc, node: str, vmid: int):
    """Ritorna (handle, type) gestendo sia QEMU che LXC."""
    vms = svc.get_all_vms()
    vm = next((v for v in vms if v.get("vmid") == vmid and v.get("node") == node), None)
    if not vm:
        raise HTTPException(status_code=404, detail="VM not found")
    vtype = vm.get("type")
    if vtype == "lxc":
        return svc.proxmox.nodes(node).lxc(vmid), "lxc"
    return svc.proxmox.nodes(node).qemu(vmid), "qemu"


@router.get("/{cluster_id}/vms/{node}/{vmid}/config")
def vm_get_config(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    ck = cache_key("vm_config", cluster_id, node, vmid)
    hit = cache_get(ck)
    if hit is not None:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, vtype = _vm_handle(svc, node, vmid)
        cfg = handle.config.get()
        data = {"type": vtype, "config": cfg}
        cache_set(ck, data, ttl=5)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/rrddata")
def vm_rrddata(cluster_id: int, node: str, vmid: int, timeframe: str = "hour", db: Session = Depends(get_db)):
    """Dati storici VM (cpu, mem, net, disk)."""
    ck = cache_key("vm_rrd", cluster_id, node, vmid, timeframe)
    hit = cache_get(ck)
    if hit is not None:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        data = handle.rrddata.get(timeframe=timeframe, cf="AVERAGE")
        cache_set(ck, data, ttl=5)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/status")
def vm_get_status(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    ck = cache_key("vm_status", cluster_id, node, vmid)
    hit = cache_get(ck)
    if hit is not None:
        return hit
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        data = handle.status.current.get()
        cache_set(ck, data, ttl=3)
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/vms/{node}/{vmid}/config", dependencies=[Depends(require_operator_or_admin)])
def vm_update_config(cluster_id: int, node: str, vmid: int, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        # Rimuovi chiavi vuote
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        if not clean:
            raise HTTPException(status_code=400, detail="No fields to update")
        handle.config.put(**clean)
        return {"status": "ok", "updated": list(clean.keys())}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---- Firewall VM-level ----
@router.get("/{cluster_id}/vms/{node}/{vmid}/firewall/rules")
def fw_vm_rules(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        return handle.firewall.rules.get()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/firewall/rules", dependencies=[Depends(require_operator_or_admin)])
def fw_vm_add_rule(cluster_id: int, node: str, vmid: int, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        handle.firewall.rules.post(**clean)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/vms/{node}/{vmid}/firewall/rules/{pos}", dependencies=[Depends(require_operator_or_admin)])
def fw_vm_move_rule(cluster_id: int, node: str, vmid: int, pos: int, payload: dict, db: Session = Depends(get_db)):
    """Sposta/modifica regola VM. payload={moveto: N} per riordinare."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        to_delete = [k for k, v in payload.items() if (v is None or v == "") and k not in ("moveto", "delete")]
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        if to_delete:
            clean["delete"] = ",".join(to_delete)
        handle.firewall.rules(pos).put(**clean)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{cluster_id}/vms/{node}/{vmid}/firewall/rules/{pos}", dependencies=[Depends(require_operator_or_admin)])
def fw_vm_del_rule(cluster_id: int, node: str, vmid: int, pos: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        handle.firewall.rules(pos).delete()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/firewall/options")
def fw_vm_options(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        return handle.firewall.options.get()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/firewall/log")
def fw_vm_log(cluster_id: int, node: str, vmid: int, limit: int = 100, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        return handle.firewall.log.get(limit=limit)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/vms/{node}/{vmid}/firewall/options", dependencies=[Depends(require_operator_or_admin)])
def fw_vm_set_options(cluster_id: int, node: str, vmid: int, payload: dict, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        clean = {k: v for k, v in payload.items() if v is not None and v != ""}
        handle.firewall.options.put(**clean)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/snapshots")
def vm_list_snapshots(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        return handle.snapshot.get()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/snapshots", dependencies=[Depends(require_operator_or_admin)])
def vm_create_snapshot(cluster_id: int, node: str, vmid: int, payload: dict, db: Session = Depends(get_db)):
    """payload: {snapname, description, vmstate (0/1, solo QEMU)}"""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, vtype = _vm_handle(svc, node, vmid)
        kwargs = {"snapname": payload["snapname"]}
        if payload.get("description"):
            kwargs["description"] = payload["description"]
        if vtype == "qemu" and payload.get("vmstate"):
            kwargs["vmstate"] = int(payload["vmstate"])
        task = handle.snapshot.post(**kwargs)
        return {"status": "ok", "task_id": task}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/snapshots/{name}/rollback", dependencies=[Depends(require_operator_or_admin)])
def vm_rollback_snapshot(cluster_id: int, node: str, vmid: int, name: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        task = handle.snapshot(name).rollback.post()
        return {"status": "ok", "task_id": task}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{cluster_id}/vms/{node}/{vmid}/snapshots/{name}", dependencies=[Depends(require_operator_or_admin)])
def vm_delete_snapshot(cluster_id: int, node: str, vmid: int, name: str, db: Session = Depends(get_db)):
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        task = handle.snapshot(name).delete()
        return {"status": "ok", "task_id": task}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.put("/{cluster_id}/vms/{node}/{vmid}/snapshots/{name}", dependencies=[Depends(require_operator_or_admin)])
def vm_update_snapshot(cluster_id: int, node: str, vmid: int, name: str, payload: dict, db: Session = Depends(get_db)):
    """Aggiorna descrizione snapshot."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, _ = _vm_handle(svc, node, vmid)
        handle.snapshot(name).config.put(description=payload.get("description", ""))
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/action", dependencies=[Depends(require_operator_or_admin)])
def vm_action(cluster_id: int, node: str, vmid: int, action: str, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if action not in ("start", "stop", "shutdown", "reset", "reboot"):
        raise HTTPException(status_code=400, detail="Invalid action")
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        vms = svc.get_all_vms()
        vm = next((v for v in vms if v.get("vmid") == vmid and v.get("node") == node), None)
        if not vm:
            raise HTTPException(status_code=404, detail="VM not found")
        vtype = vm.get("type")
        if vtype == "lxc":
            task_id = svc.proxmox.nodes(node).lxc(vmid).status(action).post()
        else:
            task_id = svc.proxmox.nodes(node).qemu(vmid).status(action).post()
        log_action(db, request, user, f"vm_{action}", vtype, f"{node}/{vmid}",
                   {"cluster": cluster.name, "name": vm.get("name")})
        return {"status": "ok", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{cluster_id}/vms/{node}/{vmid}/interfaces")
def vm_interfaces(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    """Ritorna le interfacce di rete con IP dalla QEMU Guest Agent o config LXC."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, vtype = _vm_handle(svc, node, vmid)
        if vtype == "qemu":
            try:
                result = handle("agent/network-get-interfaces").get()
                return {"type": "qemu", "interfaces": result.get("result", result)}
            except Exception:
                return {"type": "qemu", "interfaces": [], "note": "Guest Agent non disponibile"}
        else:
            cfg = handle.config.get()
            ifaces = []
            for k, v in cfg.items():
                if k.startswith("net"):
                    parts = dict(p.split("=", 1) for p in v.split(",") if "=" in p)
                    ifaces.append({"name": parts.get("name", k), "ip": parts.get("ip", ""), "gw": parts.get("gw", "")})
            return {"type": "lxc", "interfaces": ifaces}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---- Console Proxy (VNC/xterm.js) ----
@router.post("/{cluster_id}/nodes/{node}/console")
def node_console_proxy(cluster_id: int, node: str, db: Session = Depends(get_db)):
    """Genera ticket per console shell del nodo (xterm.js via termproxy)."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        data = svc.proxmox.nodes(node).termproxy.post()
        return {
            "ticket": data.get("ticket"),
            "port": data.get("port"),
            "node": node,
            "host": cluster.host,
            "pve_port": cluster.port,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{cluster_id}/vms/{node}/{vmid}/console")
def vm_console_proxy(cluster_id: int, node: str, vmid: int, db: Session = Depends(get_db)):
    """Genera ticket VNC/term per console VM o CT."""
    cluster = _get_cluster_or_404(cluster_id, db)
    try:
        svc = ProxmoxService(cluster)
        handle, vtype = _vm_handle(svc, node, vmid)
        if vtype == "lxc":
            data = handle.termproxy.post()
        else:
            data = handle.vncproxy.post(websocket=1)
        return {
            "ticket": data.get("ticket"),
            "port": data.get("port"),
            "type": vtype,
            "node": node,
            "vmid": vmid,
            "host": cluster.host,
            "pve_port": cluster.port,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
