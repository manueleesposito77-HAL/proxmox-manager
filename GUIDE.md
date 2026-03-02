# Nexus Proxmox Manager - Guida Operativa

Questa guida ti accompagnerà nell'installazione e nella prima configurazione di **Nexus Proxmox Manager**.

## 1. Prerequisiti
Assicurati di avere installato sul tuo sistema:
- **Docker** e **Docker Compose**
- **Git**
- **Python** (necessario per generare la chiave di cifratura)

## 2. Generazione della Chiave di Cifratura (AES-256)
Il sistema protegge i tuoi token API Proxmox tramite cifratura Fernet. Devi generare una chiave segreta univoca per la tua installazione.

Apri un terminale (PowerShell o Bash) ed esegui:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
**Copia la stringa risultante.** Ne avrai bisogno nel passaggio successivo.

## 3. Configurazione dell'Ambiente
Crea un file `.env` nella cartella `backend/` con il seguente contenuto (sostituisci i valori segnaposto):

```env
ENCRYPTION_KEY=INSERISCI_LA_CHIAVE_GENERATA_SOPRA
DATABASE_URL=postgresql://nexus:securepass@db:5432/nexus_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=una_stringa_lunga_e_casuale_per_il_jwt
```

## 4. Avvio dell'Applicazione con Docker
Dalla cartella principale del progetto (`proxmox-manager`), avvia l'intero stack tecnologico:

```bash
docker-compose up --build -d
```

Questo comando avvierà:
- **Database (PostgreSQL)**: Porta `5432`
- **Cache (Redis)**: Porta `6379`
- **Backend (FastAPI)**: Porta `8000`
- **Frontend (React)**: Porta `3000`

## 5. Registrazione del Primo Cluster Proxmox
L'applicazione non ha cluster registrati inizialmente. Puoi aggiungerne uno tramite l'interfaccia Swagger del backend:

1. Apri il browser su: `http://localhost:8000/docs`
2. Individua l'endpoint `POST /api/v1/clusters`.
3. Clicca su **"Try it out"** e compila il JSON:
   ```json
   {
     "name": "Cluster-Produzione",
     "host": "192.168.1.100",
     "auth_user": "root@pam!MIO-TOKEN-ID",
     "auth_token": "IL-SEGRETO-DEL-TOKEN",
     "auth_type": "token"
   }
   ```
4. Clicca su **"Execute"**. Se ricevi un codice `200`, il cluster è registrato e il token è cifrato nel database.

## 6. Accesso alla Dashboard
Vai su `http://localhost:3000` per visualizzare la dashboard. Il frontend inizierà automaticamente a interrogare il backend per aggregare i dati dei cluster registrati.

---

## Troubleshooting
- **Logs del Backend**: `docker logs -f nexus-api`
- **Logs del Frontend**: `docker logs -f nexus-ui`
- **Database non raggiungibile**: Assicurati che il container `nexus-db` sia in stato "Running".

## Sviluppo Futuro
- **Alembic**: Per gestire le migrazioni del database, entra nel container API ed esegui `alembic upgrade head`.
- **RBAC**: Modifica `app/models/user.py` (da creare) per implementare i ruoli.
