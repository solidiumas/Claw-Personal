# Testoppsett frontend og lokal kjøring
Dette dokumentet beskriver endringene og feilsøkingen som ble utført *etter* den initielle Fase 6-implementeringen for å sikre stabil drift på `localhost`.

---

## 1. Miljøkonfigurasjon (.env)
For å kunne kjøre systemet lokalt uten ferdig konfigurerte API-nøkler, ble `.env` generert med følgende automatiske tilpasninger:

- **Automatiske Nøkler:** Genererte 32-bits hex-nøkler for `LITELLM_MASTER_KEY`, `SESSION_SECRET` og `VAULT_MASTER_KEY` ved hjelp av `openssl`.
- **URL-oppsett:**
  - `FRONTEND_URL` satt til `http://localhost:3001`
  - `NEXT_PUBLIC_API_URL` satt til `http://localhost:3000` (slik at frontenden vet hvor den skal sende API-kall).

---

## 2. Docker Build-fikser
Vi støtte på utfordringer under `docker compose build` fordi prosjektet manglet `package-lock.json`-filer.

- **Endring:** Endret `RUN npm ci` til `RUN npm install` i både:
  - `frontend/Dockerfile`
  - `orchestrator/Dockerfile`
- **Resultat:** Docker kan nå bygge bildene og generere avhengigheter dynamisk første gang uten en eksisterende lock-fil.

---

## 3. Helsesjekk (Healthcheck) for LiteLLM
`litellm-proxy`-containeren ble hengende i status "Starting" eller "Unhealthy", noe som blokkerte Orkestratoren og Frontenden. To problemer ble løst:

1. **Manglende verktøy:** `litellm`-imaget inneholder ikke `curl` eller `wget`.
   - **Løsning:** Endret testen til å bruke `python3` (som er tilgjengelig i imaget).
2. **Autentisering (401):** Siden vi satte en `MASTER_KEY`, krevde `/health`-endepunktet autentisering, noe som fikk den enkle sjekken til å feile.
   - **Løsning:** Endret sjekken fra en HTTP-forespørsel til en enkel TCP-portsjekk (socket test) på port 4000.
   - **Kommando:** `python3 -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.connect(('localhost', 4000))"`

---

## 4. Andre tilpasninger (Fase 7 Forberedelser)
Det ble også gjort små endringer for å forberede Fase 7, som inkluderte:

- **Orchestrator URL:** La til `ORCHESTRATOR_URL=http://claw-orchestrator:3000` i `docker.service.js` for at fremtidige NanoClaw-containere skal vite hvor bakenden befinner seg.
- **Docker Compose:** La til scaffolding for `nanoclaw-base`-imaget i `docker-compose.yml`.

---

## 5. Oppstartsprosedyre lokalt
For å starte systemet nå:

```bash
# 1. Bygg og start
docker compose up --build -d

# 2. Sjekk at alt er OK
docker ps

# 3. Tilgang via nettleser:
# - Frontend: http://localhost:3001
# - Backend API: http://localhost:3000/health
```

---

**Status:** Systemet kjører nå stabilt på localhost med fungerende kommunikasjon mellom alle containere.
