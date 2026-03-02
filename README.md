# Proxmox Cluster Manager (Nexus)

Progetto professionale per la gestione centralizzata di più server e cluster Proxmox VE.

## Caratteristiche
- Monitoraggio multi-cluster centralizzato.
- Gestione VM/LXC (Start, Stop, Create, Backup).
- Architettura scalabile con FastAPI e React.
- Cifratura delle credenziali Proxmox (AES-256).

## Installazione e Avvio
Per le istruzioni dettagliate su come configurare l'ambiente e avviare l'applicazione, consulta la **[Guida Operativa (GUIDE.md)](./GUIDE.md)**.

## Tecnologie Utilizzate
- **Backend**: Python 3.11 (FastAPI)
- **Frontend**: React + Tailwind CSS
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Container**: Docker + Docker Compose

## Stato del Progetto
- [x] Inizializzazione architettura
- [x] Dockerization completa
- [x] Backend Core (Proxmox Service & API)
- [x] Frontend Dashboard (Base UI)
- [ ] Implementazione RBAC
- [ ] Notifiche Telegram
