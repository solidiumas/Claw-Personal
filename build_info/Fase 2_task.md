# Utvikling del 2: Backend Orkestrator — Oppgaver

## Fase 1: Prosjektoppsett
- [x] Opprette `orchestrator/` mappestruktur
- [x] Opprette `orchestrator/package.json` med avhengigheter
- [x] Opprette `orchestrator/src/config/index.js` — sentralisert konfigurasjon

## Fase 2: Kjernetjenester
- [x] Opprette `orchestrator/src/services/token.service.js` — token-generering og lagring
- [x] Opprette `orchestrator/src/services/litellm.service.js` — LiteLLM API-klient
- [x] Opprette `orchestrator/src/services/docker.service.js` — Dockerode container-håndtering

## Fase 3: Server og ruter
- [x] Opprette `orchestrator/src/routes/webhook.routes.js` — webhook-ruter
- [x] Opprette `orchestrator/src/server.js` — Express-server

## Fase 4: Docker og infrastruktur
- [x] Opprette `orchestrator/Dockerfile`
- [x] Oppdatere `docker-compose.yml` med orkestrator-tjeneste
- [x] Oppdatere `.env.example` med nye miljøvariabler
- [x] Verifisere `.gitignore` dekker orchestrator/node_modules ✅ (allerede dekket)

## Fase 5: Verifikasjon
- [ ] Installere avhengigheter med `npm install` (krever Node.js)
- [ ] Teste at appen starter uten feil
- [ ] Verifisere endepunkter

> [!NOTE]
> Node.js/npm er ikke installert på denne maskinen. Verifisering kan gjøres ved:
> 1. Installere Node.js lokalt og kjøre `npm install && npm run dev` i `orchestrator/`
> 2. Eller bruke Docker Compose: `docker compose up -d` som bygger alt automatisk
