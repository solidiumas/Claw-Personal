# Fase 1: Infrastruktur og LiteLLM Proxy — Implementeringsplan

## Bakgrunn og mål

Vi bygger **Fase 1** av NanoClaw / Claw Personal-plattformen: en AI-agent-tjeneste der hver bruker får sin egen isolerte Docker-container. For å unngå lekkasje av API-nøkler bruker vi en felles **LiteLLM-container** som proxy mellom brukercontainere og Anthropic/Claude API.

**Hovedmål for denne fasen:**
- Sette opp Docker Compose-infrastruktur på en felles VPS
- Konfigurere LiteLLM som intern proxy-container
- Etablere et lukket Docker-nettverk for sikker intern kommunikasjon
- Implementere Virtual Keys / intern token-autorisasjon

---

## Brukeranmerkninger som krever gjennomgang

> [!IMPORTANT]
> **API-nøkkel:** Du trenger en gyldig Anthropic API-nøkkel (`ANTHROPIC_API_KEY`) for å konfigurere LiteLLM. Denne legges i en `.env`-fil som **aldri** skal committes til versjonskontroll.

> [!IMPORTANT]
> **Master Key:** LiteLLM trenger en `LITELLM_MASTER_KEY` — dette er admin-nøkkelen som brukes til å opprette og administrere Virtual Keys for brukercontainere. Velg en sterk, unik nøkkel.

> [!WARNING]
> **Produksjonsklar?** Denne planen setter opp et *utviklingsmiljø*. Før produksjon trengs ytterligere hardening: TLS-sertifikater, brannmurregler, secrets management (f.eks. HashiCorp Vault), overvåking, logging, backup-strategier, osv.

---

## Foreslåtte endringer

### Infrastruktur (Docker Compose / Nettverk)

Oppsummering: Vi oppretter en `docker-compose.yml` som definerer LiteLLM-proxyen og et lukket internt Docker-nettverk. Fremtidige NanoClaw-brukercontainere kobles til dette nettverket og kan snakke med LiteLLM uten at proxyen eksponeres for åpent internett.

#### [NEW] [docker-compose.yml](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/docker-compose.yml)

```yaml
version: "3.9"

services:
  litellm-proxy:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: litellm-proxy
    restart: unless-stopped
    ports:
      # Eksponerer kun på localhost for admin / debugging under utvikling.
      # I produksjon: fjern denne porten eller bruk en reverse proxy.
      - "127.0.0.1:4000:4000"
    volumes:
      - ./litellm/config.yaml:/app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    command:
      - "--config"
      - "/app/config.yaml"
      - "--port"
      - "4000"
    networks:
      - claw-internal

networks:
  claw-internal:
    name: claw-internal
    driver: bridge
    internal: true  # Blokkerer direkte internett-tilgang fra nettverket
```

**Nøkkelpunkter:**
- `internal: true` på nettverket sikrer at containere på `claw-internal` *ikke* har direkte tilgang til internett. All LLM-trafikk *må* gå gjennom LiteLLM-proxyen.
- LiteLLM-containeren har et ekstra nettverk (default bridge) som gir den internett-tilgang til Anthropic API.
- Port `4000` eksponeres kun på `127.0.0.1` (localhost) for adminformål. Brukercontainere snakker med `litellm-proxy:4000` via det interne nettverket.

> [!NOTE]
> LiteLLM-containeren trenger internett-tilgang for å nå Anthropic API. Docker Compose gir den automatisk tilgang via default-nettverket i tillegg til `claw-internal`. Vi kan også gi den eksplisitt to nettverk (et internt og et eksternt) dersom vi ønsker finere kontroll.

---

### LiteLLM-konfigurasjon

Oppsummering: Vi oppretter en `config.yaml` for LiteLLM som definerer hvilke modeller som er tilgjengelige, og setter opp forventning om autorisasjon via en master key og virtuelle nøkler.

#### [NEW] [litellm/config.yaml](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/litellm/config.yaml)

```yaml
# LiteLLM Proxy Configuration — Claw Personal / NanoClaw
# Dokumentasjon: https://docs.litellm.ai/docs/proxy/configs

model_list:
  # Claude 3.5 Sonnet — primærmodell for NanoClaw
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  # Claude 3.5 Haiku — raskere/billigere alternativ
  - model_name: claude-haiku
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  # Fallback / fremtidig: Gemini kan legges til her uten kodeendringer i NanoClaw
  # - model_name: gemini-flash
  #   litellm_params:
  #     model: gemini/gemini-2.0-flash
  #     api_key: os.environ/GOOGLE_API_KEY

general_settings:
  # Master key — brukes til å opprette og administrere Virtual Keys
  master_key: os.environ/LITELLM_MASTER_KEY

  # Aktiver spend tracking per nøkkel (for kostnadskontroll)
  max_budget: 100          # Maks total budget i USD (juster etter behov)
  budget_duration: 30d     # Budget-periode

litellm_settings:
  # Logg alle forespørsler for debugging og kostnadsovervåking
  set_verbose: false
  drop_params: true   # Dropp ukjente parametere i stedet for å feile
  num_retries: 3
  request_timeout: 120
```

**Nøkkelpunkter:**
- `model_name` er aliasene NanoClaw-containere bruker. De trenger aldri å vite den faktiske API-nøkkelen.
- `os.environ/ANTHROPIC_API_KEY` betyr at LiteLLM leser nøkkelen fra miljøvariabelen, som settes i `.env`.
- `master_key` beskytter admin-API-et. Kun orkestratoren (som oppretter brukercontainere) trenger denne.
- Virtual Keys opprettes via LiteLLM sitt admin-API og tildeles individuelle brukercontainere.

---

### Miljøvariabler

#### [NEW] [.env.example](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/.env.example)

```env
# === Claw Personal / NanoClaw — Miljøvariabler ===
# Kopier denne filen til .env og fyll inn verdier.
# .env skal ALDRI committes til versjonskontroll!

# Anthropic API-nøkkel (Master Key for Claude)
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXX

# LiteLLM Master Key — admin-nøkkel for å opprette Virtual Keys
# Generer en sterk, unik nøkkel (f.eks. med `openssl rand -hex 32`)
LITELLM_MASTER_KEY=sk-clawpersonal-XXXXXXXXXXXXXXXX
```

#### [NEW] [.gitignore](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/.gitignore)

Legger til `.env` for å forhindre at hemmeligheter committes.

---

### Hjelpeskript

#### [NEW] [scripts/create-virtual-key.sh](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/scripts/create-virtual-key.sh)

Et enkelt skript som demonstrerer hvordan orkestratoren oppretter en Virtual Key for en ny brukercontainer:

```bash
#!/bin/bash
# Oppretter en Virtual Key i LiteLLM for en ny brukercontainer.
# Bruk: ./scripts/create-virtual-key.sh <bruker-id>

USER_ID="${1:?Bruk: $0 <bruker-id>}"
LITELLM_HOST="${LITELLM_HOST:-http://localhost:4000}"
MASTER_KEY="${LITELLM_MASTER_KEY:?Sett LITELLM_MASTER_KEY}"

curl -s -X POST "${LITELLM_HOST}/key/generate" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"${USER_ID}\",
    \"max_budget\": 10,
    \"budget_duration\": \"30d\",
    \"models\": [\"claude-sonnet\", \"claude-haiku\"],
    \"metadata\": {
      \"user_id\": \"${USER_ID}\",
      \"created_by\": \"orchestrator\"
    }
  }"
```

**Nøkkelpunkter:**
- Orkestratoren kaller dette (eller tilsvarende logikk i Python/Node.js) når en ny bruker registrerer seg.
- Brukercontaineren mottar den genererte Virtual Key og bruker den til å autentisere mot `litellm-proxy:4000`.
- `max_budget` og `budget_duration` gir kostnadskontroll per bruker.

#### [NEW] [scripts/start-user-container.sh](file:///Users/thomasuthaug/Desktop/Nrth%20AI%20-%20Claw%20Personal/scripts/start-user-container.sh)

Et eksempelskript som viser hvordan orkestratoren spinner opp en isolert NanoClaw-container per bruker:

```bash
#!/bin/bash
# Spinner opp en isolert NanoClaw-container for en bruker.
# Bruk: ./scripts/start-user-container.sh <bruker-id> <virtual-key>

USER_ID="${1:?Bruk: $0 <bruker-id> <virtual-key>}"
VIRTUAL_KEY="${2:?Bruk: $0 <bruker-id> <virtual-key>}"

docker run -d \
  --name "claw-user-${USER_ID}" \
  --network claw-internal \
  --restart unless-stopped \
  -e OPENAI_API_KEY="${VIRTUAL_KEY}" \
  -e OPENAI_API_BASE="http://litellm-proxy:4000" \
  -e MODEL_NAME="claude-sonnet" \
  -e USER_ID="${USER_ID}" \
  nanoclaw:latest
```

**Nøkkelpunkter:**
- Containeren kobles til `claw-internal`-nettverket.
- `OPENAI_API_KEY` settes til den virtuelle nøkkelen (LiteLLM støtter OpenAI-kompatibelt API-format).
- `OPENAI_API_BASE` peker på den interne LiteLLM-proxyen.
- Containeren har *ikke* direkte internett-tilgang (pga. `internal: true` på nettverket).

---

## Åpne spørsmål

> [!IMPORTANT]  
> **NanoClaw Docker Image:** Planen forutsetter at det finnes et `nanoclaw:latest` Docker-image. Har dere allerede et slikt image, eller skal vi bygge et i neste fase?

> [!IMPORTANT]  
> **Database:** Spesifikasjonene nevner PostgreSQL (via Supabase eller Neon) for metadata. Skal vi inkludere en PostgreSQL-container i denne `docker-compose.yml`, eller brukes en ekstern tjeneste?

> [!IMPORTANT]
> **LiteLLM-versjon:** Planen bruker `ghcr.io/berriai/litellm:main-latest`. Ønsker dere å pinne til en spesifikk versjon for stabilitet?

---

## Verifiseringsplan

### Automatiserte tester

1. **Start infrastrukturen:**
   ```bash
   cp .env.example .env
   # Fyll inn ANTHROPIC_API_KEY og LITELLM_MASTER_KEY
   docker compose up -d
   ```

2. **Verifiser at LiteLLM-proxyen kjører:**
   ```bash
   curl http://localhost:4000/health
   ```

3. **Opprett en Virtual Key:**
   ```bash
   ./scripts/create-virtual-key.sh test-user-001
   ```

4. **Test et API-kall gjennom proxyen:**
   ```bash
   curl http://localhost:4000/v1/chat/completions \
     -H "Authorization: Bearer <virtual-key-fra-steg-3>" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "claude-sonnet",
       "messages": [{"role": "user", "content": "Hei! Si hallo."}]
     }'
   ```

5. **Verifiser nettverksisolasjon:** Start en testcontainer på `claw-internal` og bekreft at den *ikke* kan nå internett direkte, men *kan* nå `litellm-proxy:4000`.

### Manuell verifisering

- Gjennomgå at `.env` ikke er commitet til versjonskontroll.
- Bekreft at LiteLLM logger bruk per Virtual Key (for fremtidig kostnadskontroll).
- Verifiser at brukercontainere ikke kan lese master-nøkkelen.
