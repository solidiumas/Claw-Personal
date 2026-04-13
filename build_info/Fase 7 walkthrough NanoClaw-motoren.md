# Fase 7 — NanoClaw-motoren (Data Plane): Walkthrough

## Status: ✅ Bygget

**Ansvarlig agent:** AI Agent Builder  
**Dato:** 2026-04-13

---

## Hva ble bygget

### NanoClaw Python-kodebase (`nanoclaw/`)

Selve AI-agenten som kjører isolert per bruker i `claw-internal`-nettverket. Dette er Docker-imaget `nanoclaw-base:latest` som det refereres til i Fase 1 og 2.

#### Filstruktur

```
nanoclaw/
├── Dockerfile              # Multi-stage Python 3.12 build (non-root)
├── requirements.txt        # openai, google-api-python-client, httpx, watchdog
└── src/
    ├── main.py             # Entry point: wake-listener → vault → agent
    ├── config.py           # Sentralisert miljøvariabel-konfigurasjon
    ├── vault_client.py     # HTTP-klient mot Orkestratoren (/vault/tokens)
    ├── llm_client.py       # OpenAI SDK wrapper → LiteLLM proxy
    ├── tools/
    │   ├── __init__.py     # Aggregerer alle verktøy og dispatcher
    │   ├── gmail.py        # Gmail read-only tools (list, search, get)
    │   └── calendar.py     # Calendar read-only tools (events, calendars)
    └── agent/
        ├── __init__.py
        └── loop.py         # Action-observation agent-loop
```

---

## Komponentoversikt

### 1. Entry Point (`main.py`)

Containerens hovedprosess med livssyklusen:
1. **Standby** — Overvåker `/tmp/wake.signal`
2. **Initialisering** — Henter tokens fra Vault, initialiserer LLM
3. **Kjøring** — Action-observation agent-loop
4. **Tilbake til standby** — Venter på neste signal

Wake-signalet sendes av Orkestratoren via `docker exec`:
```bash
echo "OAUTH_TOKENS_READY" > /tmp/wake.signal
```

### 2. Vault Client (`vault_client.py`)

Sikker HTTP-klient for å hente dekrypterte OAuth-tokens:
- **Endepunkt:** `GET http://claw-orchestrator:3000/vault/tokens`
- **Autentisering:** `Authorization: Bearer <INTERNAL_TOKEN>`
- **Retry:** 5 forsøk med eksponentiell backoff
- **Token-refresh:** `POST /vault/tokens/refresh`

Tokens holdes **KUN i minne** — aldri til disk.

### 3. LLM Client (`llm_client.py`)

OpenAI SDK wrapper som ruter forespørsler gjennom LiteLLM:
- **Base URL:** `http://litellm-proxy:4000/v1`
- **API Key:** LiteLLM Virtual Key (per-bruker budsjett)
- **Støtter:** Chat completions med tool/function calling

### 4. Google Tools (`tools/gmail.py`, `tools/calendar.py`)

Read-only verktøy i OpenAI function calling-format:

| Verktøy | Beskrivelse |
|---|---|
| `gmail_list_messages` | Vis siste e-poster i innboksen |
| `gmail_search` | Søk e-poster med Gmail-query |
| `gmail_get_message` | Hent fullstendig e-postinnhold |
| `calendar_list_events` | Vis kommende hendelser |
| `calendar_get_event` | Hent detaljer om en hendelse |
| `calendar_list_calendars` | Vis tilgjengelige kalendere |

### 5. Agent Loop (`agent/loop.py`)

Kjernelogikken — Action-Observation mønster:
1. LLM mottar system prompt + verktøydefinisjoner
2. LLM velger verktøy → utfører → observerer resultat
3. Loop gjentas til LLM svarer uten verktøykall
4. Sikkerhet: Maks 25 iterasjoner, 120s timeout per LLM-kall

---

## Orkestrator-endringer

### Ny rute: `/vault/tokens` (`vault.routes.js`)

Nytt internt API-endepunkt for NanoClaw-containere:

| Metode | Rute | Beskrivelse |
|---|---|---|
| `GET` | `/vault/tokens` | Hent dekrypterte OAuth-tokens |
| `POST` | `/vault/tokens/refresh` | Forny utløpt access_token |

**Sikkerhet:**
- Bearer token-autentisering via `INTERNAL_TOKEN`
- Token valideres mot `internal_tokens`-tabellen + `users.license_status`
- KUN tilgjengelig over `claw-internal`-nettverket

### Oppdaterte filer

- `server.js` — Registrert `/vault` ruter, versjon → v0.4.0
- `docker.service.js` — Lagt til `ORCHESTRATOR_URL` i container env

---

## Dataflyt (E2E)

```
1. Orkestrator sender wake-signal → docker exec → /tmp/wake.signal
2. NanoClaw leser signal → starter initialisering
3. NanoClaw → GET /vault/tokens (med INTERNAL_TOKEN)
4. Orkestrator dekrypterer tokens fra PostgreSQL (The Vault)
5. Tokens returneres → NanoClaw lagrer i minne
6. NanoClaw → LLM (tool calling) via LiteLLM proxy
7. LLM velger Gmail/Calendar-verktøy
8. NanoClaw utfører verktøy med OAuth-tokens
9. Resultat → tilbake til LLM → neste iterasjon
10. LLM gir endelig svar → Agent-loop ferdig
```

---

## Bygg imaget

```bash
docker build -t nanoclaw-base:latest ./nanoclaw
```

---

## Gjenstående for produksjon

- [ ] Legg til YouTube Analytics-verktøy
- [ ] Implementer kontinuerlig agent-kjøring (scheduler)
- [ ] Legg til WebSocket/SSE for sanntids-status til frontend
- [ ] Implementer graceful token-refresh midt i agent-loop
- [ ] Legg til metrics/logging (Prometheus/Grafana)
