from proxmoxer import ProxmoxAPI
from app.models.cluster import Cluster
from app.core.config import get_settings
from cryptography.fernet import Fernet
import urllib3
import logging

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
settings = get_settings()
cipher = Fernet(settings.ENCRYPTION_KEY)

class ProxmoxService:
    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self.proxmox = self._connect()

    def _decrypt_token(self, encrypted_token: str) -> str:
        return cipher.decrypt(encrypted_token.encode()).decode()

    def _connect(self) -> ProxmoxAPI:
        try:
            token_or_password = self._decrypt_token(self.cluster.auth_token)
            if self.cluster.auth_type == "token":
                user, token_name = self.cluster.auth_user.split("!")
                return ProxmoxAPI(
                    self.cluster.host, user=user, token_name=token_name,
                    token_value=token_or_password, verify_ssl=self.cluster.verify_ssl, port=self.cluster.port
                )
            return ProxmoxAPI(
                self.cluster.host, user=self.cluster.auth_user,
                password=token_or_password, verify_ssl=self.cluster.verify_ssl, port=self.cluster.port
            )
        except Exception as e:
            logger.error(f"Failed to connect to cluster {self.cluster.name}: {str(e)}")
            raise ConnectionError(f"Proxmox Connection Failed: {str(e)}")

    def get_all_vms(self):
        """Ritorna la lista di tutte le VM nel cluster"""
        return self.proxmox.cluster.resources.get(type="vm")

    def create_vm(self, node: str, vmid: int, name: str, cores: int, memory: int, storage: str, net_bridge: str = "vmbr0"):
        """
        Esempio di creazione professionale di una VM
        """
        try:
            logger.info(f"Creating VM {vmid} ({name}) on node {node}")
            task_id = self.proxmox.nodes(node).qemu.create(
                vmid=vmid,
                name=name,
                cores=cores,
                memory=memory,
                scsihw="virtio-scsi-pci",
                net0=f"virtio,bridge={net_bridge}",
                scsi0=f"{storage}:32", # 32GB disk
                ostype="l26", # Linux 2.6+
            )
            return {"status": "success", "task_id": task_id}
        except Exception as e:
            logger.error(f"VM Creation failed: {str(e)}")
            return {"status": "error", "message": str(e)}

    def vm_action(self, node: str, vmid: int, action: str):
        """Azioni: start, stop, shutdown, reset"""
        return self.proxmox.nodes(node).qemu(vmid).status.post(action)
