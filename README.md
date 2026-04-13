# Claw Personal (NanoClaw Core) 🚀

Claw Personal er et moderne SaaS "Zero-Delay"-system bygget rundt konseptet om sikre, isolerte personlige AI-assistenter. Tjenesten gir brukeren sin egen dedikerte maskin (Docker container) og kjører med absolutt personvern ved hjelp av Zero-Knowledge krypterte The Vault-tokens.

Prosjektet er designet for maksimal hastighet under onboarding, skalerbarhet via sentralisert orkestrering, og null datadeling mellom kunder.

---

## 🏗️ Arkitektur-Oversikt

Prosjektet er bygget opp av 4 hovedkomponenter gjennom en service-isolert `docker-compose` arkitektur:

1. **Frontend Portal (The Gateway):** Et Next.js 15 web interface med *Glassmorphism*-design som håndterer onboarding, Stripe-kasseløsning og Google "Magic Connect".
2. **Orkestrator (Control Plane):** En Node.js Express server som lytter på Stripe webhooks, styrer Docker-Daemon for opprettelse av AI-containere, administrerer Zero-Knowledge kryptering og holder persistert tilstand mot PostgreSQL.
3. **LiteLLM Proxy:** En sentral oversetter som skjuler Anthropic / Google sine kjerne-API-er. Hver brukercontainer gis et fiktivt API-pass (Virtual Key) begrenset til en bestemt sum for å forhindre "run-away"-bruk av kostbare AI modeller.
4. **NanoClaw Core (Data Plane):** Den underliggende AI-agenten. Utviklet i Python 3.12, agerer fullstendig internt, mottar sine dekrypterte tokens dynamisk fra the Vault via lokalt nettverk og kontrollerer brukerens Google Workspace verktøy. 

---

## 🔐 Sikkerhet & Isolasjon (Zero-Trust)

- **Cgroup/Namespaces Isolasjon:** Alle kunder har en 100% isolert Docker-container konfigurert gjennom maskinvare-restriksjoner i *Docker Engine* (p.t. 512MB RAM og 0.5 vCPU kvoter).
- **Lukket Nettverk:** NanoClaw-agentens nettverk (`claw-internal`) har **ingen tilgang** til the World Wide Web. Den kan *bare* kommunisere med `litellm-proxy` for forespørsler.
- **The Vault:** Autentiserings-tokens for GMail, YouTube, etc. holdes ikke i klartekst i databaser engang for administratorer. Tokens blir AES-256-GCM kryptert utledet av en unik Master Key og bruker-UUID ved hjelp av `scrypt` hashing. 

---

## 🛠️ Installasjon / Kom-i-gang (Utvikling)

For å bygge og starte det fullstendige Claw Personal-systemet på din lokale maskin (eller staging-server), følg disse instruksjonene.

### 1. Forutsetninger
* Docker & Docker Compose V2 (krever tilgang til `/var/run/docker.sock`)
* Node.js 22.x+ (Dersom du ønsker å debugge Front/Orkestrator lokalt utenfor container)
* En aktiv Stripe-konto og Google Cloud (For API Client Secrets)

### 2. Klargjøre Miljøvariablene
Start med å klone variablene:
```bash
cp .env.example .env
```
Åpne `.env` i din editor og fyll ut disse helt nødvendige minimumskravene:
* `LITELLM_MASTER_KEY` (Lag noe hemmelig!)
* `ANTHROPIC_API_KEY` (Din faktiske bygge-API nøkkel for LLMs)
* `VAULT_MASTER_KEY` (Ekstremt viktig for kryptografien — bruk _openssl rand -hex 32_)
* `STRIPE_WEBHOOK_SECRET` og `STRIPE_SECRET_KEY`.

### 3. Bygge & Kjøre Stacken
Du kan nå spinne prosjektet opp fra mappen:
```bash
# Sørg for at NanoClaw image rammeverket er bygget i Docker først
docker build -t nanoclaw-base:latest ./nanoclaw

# Spinn opp hele stacken under (Postgres, Gateway, Orkestrator, LiteLLM)
docker compose up -d --build
```
Dette vil starte:
* `localhost:3001`: Frontend Portalen (Besøk i nettleser!)
* `localhost:3000`: Backend Orkestratoren og Webhook-lyttere.
* `localhost:4000`: LiteLLM Proxy admin-grensesnitt.
* Databasen kobles sømløst om bak kulissene.

### 4. Logging & Debugging
Fordi containerene instansieres programmatisk "Zero-Delay", må du hente ut loggene fra brukercontainere spesifikt:
```bash
docker logs claw-user-<bruker-ID>
```
For å feilsøke webhooks og backend Control-Plane:
```bash
docker logs -f claw-orchestrator
```

---

## 📂 Kodestruktur 

```plaintext
├── docker-compose.yml       # Felles distribusjonsinstruks
├── .env.example             # Eksempelfil for hemmeligheter og port settings
├── orchestrator/            # Node.js REST Backend (Webhook, Vault, Tokens)
│   ├── src/db               # PostgreSQL Schemas og migrator
│   └── src/services         # Dockerode logic, Vault Crypto-algoritmer
├── frontend/                # Next.js UI
│   ├── src/app/             # Router og Views (Magic Connect, Setup, Betaling)
│   └── globals.css          # Applesque Glassmorphism styling
├── nanoclaw/                # AI Agent Core (Python)
│   ├── src/agent            # LLM Prompt Logic & Loop
│   └── src/tools            # GMail/Calendar API-klienter
├── litellm/                 # Konfigurasjon for proxy-kostnadshåndtering
└── build_info/              # Dokumentasjon fra byggefasene Fase 1 til 7.
```

---

## 🛣️ Utviklings-Veikart (Planlagte lanseringsevents)
Dette depotet holder i dag `versjon 0.9` (MVP). Resterende for `v1.0`:
- [ ] Omgjør Stripe Keys til "Live" og bytt over fra lokalt testing-miljø
- [ ] Utvid Python Action-verktøyene (`youtube.py` mangler full pakke)
- [ ] Etabler en Nginx Reverse Proxy konfigurasjon med Let's Encrypt / HTTPs til produksjonsdeploy.
- [ ] Sett opp Cron-scheduler inni backenden for å purre "wake"-signaler klokken 06:00 om morgenen. 

For fullstendig statusgjennomgang fra AI Builderne, sjekk `build_info/Statusrapport etter fase 4-7 og total.md`. 
