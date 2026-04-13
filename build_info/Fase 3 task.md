# Fase 3: Onboarding & OAuth — Task Tracker

## Oppsett
- [x] Installer nye avhengigheter (`googleapis`, `express-session`)
- [x] Oppdater `.env.example` med Google OAuth og Vault variabler

## Konfigurasjon
- [x] Oppdater `config/index.js` med google, vault og session config

## Nye services
- [x] Opprett `services/vault.service.js` (Zero-Knowledge kryptering)
- [x] Opprett `services/google-auth.service.js` (Google OAuth2)

## Ruter
- [x] Opprett `routes/auth.routes.js` (OAuth-ruter)

## Oppdateringer
- [x] Oppdater `server.js` (session middleware, auth routes)
- [x] Oppdater `docker.service.js` (wakeContainer metode)
- [x] Oppdater `docker-compose.yml` (nye env-variabler)

## Verifisering
- [x] Alle filer opprettet og verifisert
- [ ] `npm install` (krever Node.js lokalt eller Docker build)
- [ ] Start server og verifiser oppstart
