"""WebSocket proxy per console VM/CT/Nodo — bypassa login Proxmox."""

import asyncio
import ssl
import logging
import urllib.parse
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.cluster import Cluster
from app.core.config import get_settings
from cryptography.fernet import Fernet

try:
    import websockets
except ImportError:
    websockets = None

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()
cipher = Fernet(settings.ENCRYPTION_KEY)


def _get_cluster(cluster_id: int, db: Session) -> Cluster:
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise Exception("Cluster not found")
    return cluster


def _decrypt_token(cluster) -> str:
    return cipher.decrypt(cluster.auth_token.encode()).decode()


def _build_auth_headers(cluster) -> dict:
    token_or_password = _decrypt_token(cluster)
    if cluster.auth_type == "token":
        return {"Authorization": f"PVEAPIToken={cluster.auth_user}={token_or_password}"}
    else:
        import requests as http_requests
        resp = http_requests.post(
            f"https://{cluster.host}:{cluster.port}/api2/json/access/ticket",
            data={"username": cluster.auth_user, "password": token_or_password},
            verify=cluster.verify_ssl, timeout=10
        )
        data = resp.json().get("data", {})
        ticket = data.get("ticket", "")
        csrf = data.get("CSRFPreventionToken", "")
        headers = {"Cookie": f"PVEAuthCookie={ticket}"}
        if csrf:
            headers["CSRFPreventionToken"] = csrf
        return headers


def _get_proxmox_ws_url(cluster, node: str, vtype: str, vmid: int, port: int, ticket: str) -> str:
    base = f"wss://{cluster.host}:{cluster.port}/api2/json"
    encoded_ticket = urllib.parse.quote(ticket, safe='')
    if vtype == "node":
        return f"{base}/nodes/{node}/vncwebsocket?port={port}&vncticket={encoded_ticket}"
    elif vtype == "lxc":
        return f"{base}/nodes/{node}/lxc/{vmid}/vncwebsocket?port={port}&vncticket={encoded_ticket}"
    else:
        return f"{base}/nodes/{node}/qemu/{vmid}/vncwebsocket?port={port}&vncticket={encoded_ticket}"


@router.websocket("/ws/{cluster_id}/console/{node}")
async def ws_console_proxy(
    websocket: WebSocket,
    cluster_id: int,
    node: str,
    port: int = Query(...),
    ticket: str = Query(...),
    vmid: int = Query(0),
    vtype: str = Query("node"),
):
    """Proxy WebSocket: browser <-> backend <-> Proxmox vncwebsocket."""
    if websockets is None:
        await websocket.close(code=1011, reason="websockets library not installed")
        return

    # noVNC richiede subprotocol 'binary', xterm.js no
    if vtype == "qemu":
        await websocket.accept(subprotocol="binary")
    else:
        await websocket.accept()

    db = next(get_db())
    try:
        cluster = _get_cluster(cluster_id, db)
        auth_headers = _build_auth_headers(cluster)
        auth_user = cluster.auth_user
    except Exception as e:
        logger.error(f"Console proxy auth error: {e}")
        await websocket.close(code=1011, reason=str(e))
        db.close()
        return
    finally:
        db.close()

    proxmox_url = _get_proxmox_ws_url(cluster, node, vtype, vmid, port, ticket)
    logger.info(f"Console proxy: connecting (vtype={vtype}, vmid={vmid})")

    ssl_ctx = ssl.create_default_context()
    if not cluster.verify_ssl:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        async with websockets.connect(
            proxmox_url,
            additional_headers=auth_headers,
            ssl=ssl_ctx,
            subprotocols=["binary"] if vtype == "qemu" else [],
            open_timeout=10,
        ) as pve_ws:
            if vtype in ("lxc", "node"):
                # Terminali (xterm.js): handshake user:vncticket\n → OK
                await pve_ws.send(f"{auth_user}:{ticket}\n")
                ok_msg = await asyncio.wait_for(pve_ws.recv(), timeout=5)
                if isinstance(ok_msg, bytes):
                    ok_msg = ok_msg.decode('utf-8', errors='replace')
                if ok_msg.strip() != "OK":
                    logger.error(f"Console proxy: handshake failed: {ok_msg}")
                    await websocket.close(code=1011, reason=f"Handshake failed: {ok_msg}")
                    return
                logger.info(f"Console proxy: term handshake OK (vtype={vtype})")
            else:
                # QEMU VNC: nessun handshake, il flusso RFB parte subito
                logger.info(f"Console proxy: VNC mode, no handshake (vtype={vtype})")

            async def browser_to_proxmox():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("text") is not None:
                            await pve_ws.send(msg["text"])
                        elif msg.get("bytes") is not None:
                            await pve_ws.send(msg["bytes"])
                        else:
                            logger.warning(f"browser->proxmox: unexpected msg type: {msg.keys()}")
                except WebSocketDisconnect:
                    logger.info("browser->proxmox: browser disconnected")
                except Exception as e:
                    logger.warning(f"browser->proxmox error: {e}")

            is_term = vtype in ("lxc", "node")

            async def proxmox_to_browser():
                msg_count = 0
                try:
                    async for msg in pve_ws:
                        msg_count += 1
                        if msg_count <= 3:
                            logger.info(f"proxmox->browser MSG#{msg_count}: type={type(msg).__name__} len={len(msg)}")
                        if is_term:
                            # Terminale: invia sempre come testo per xterm.js
                            if isinstance(msg, bytes):
                                await websocket.send_text(msg.decode('utf-8', errors='replace'))
                            else:
                                await websocket.send_text(msg)
                        else:
                            # VNC: invia bytes per noVNC
                            if isinstance(msg, bytes):
                                await websocket.send_bytes(msg)
                            else:
                                await websocket.send_text(msg)
                except Exception as e:
                    logger.warning(f"proxmox->browser error after {msg_count} msgs: {e}")

            await asyncio.gather(browser_to_proxmox(), proxmox_to_browser())

    except Exception as e:
        logger.error(f"Console proxy connection error: {e}")
        try:
            await websocket.close(code=1011, reason=f"Proxmox connection failed: {e}")
        except Exception:
            pass
