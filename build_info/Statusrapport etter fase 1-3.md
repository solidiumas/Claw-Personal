# Statusrapport: Claw Personal (Etter Fase 1-3)

Basert på en gjennomgang av de tekniske spesifikasjonene og dokumentasjonen for hva som er bygget hittil (Fase 1-3), er her en komplett analyse av prosjektets nåværende tilstand.

## ✅ 1. Hva som er på plass
Vi har fundamentet for en sikker «Zero Delay»-infrastruktur. Agentene har så langt bygget hele bak-strukturen (Control Plane og Gateway) for å håndtere brukere sikkert:

* **Infrastruktur og Nettverk (Fase 1):** 
  * Docker Compose-oppsett med to separate nettverk: ett internt (isolert fra internett, der brukercontainere lever) og ett eksternt.
  * Bash-skript i `scripts/` lagd for å forenkle generering av containere og nøkler.
* **LLM Proxy (Fase 1):** 
  * LiteLLM er konfigurert for å rute alle LLM-forespørsler sentralt og genererer midlertidige "Virtual Keys" (budsjett og tilgangskontroll for hver bruker/container).
* **Orkestratoren (Fase 2):** 
  * Node.js (Express) backend.
  * Håndterer webhook-mottak (f.eks. for betaling).
  * Bruker Dockerode for å programmatisk spinne opp isolerte `claw-user-{id}`-containere over Docker Socket under `claw-internal`-nettverket.
* **Onboarding & OAuth "Magic Connect" (Fase 3):** 
  * Integrasjon for Google OAuth 2.0 (tilgang til Gmail, Calendar, YouTube). 
  * **The Vault:** Zero-Knowledge kryptering med oppsett for å kryptere tokens (AES-256-GCM) utledet fra en Master Key og bruker-ID via `scrypt`.
  * Ruter for godkjenning (`/auth/google`) og håndtering av at en `docker exec wake.signal` sendes til aktuell brukercontainer når onbaording er fullført.

---

## ❌ 2. Hva som mangler
Dette er komponentene som beskrevet i "Teknisk løsning"-dokumentet, som ennå ikke eksisterer, eller som kun finnes som midlertidige "mockups":

* **NanoClaw-motoren (Data Plane):**
  * Selve AI-assistenten (`nanoclaw-base:latest`). Vi spinner opp containere av dette bildet, men selve Python-kodebasen som ligger inni (som kan snakke med MCP, lese eposter, utføre vurderinger og bruke LiteLLM-proxyen) er ikke bygget. 
* **Frontend Portal ("The Gateway" - UI):**
  * Den spesifiserte Next.js-brukerportalen for onboarding. Vi har kun backend-rutene for OAuth, vi mangler frontenden der brukeren trykker "Magic Connect" og Vipps-knappen.
* **Database (PostgreSQL):**
  * P.t. lagres tokens, bruker-ID-er og status kun `in-memory` (enkle JavaScript Maps i backend-kodens services). Dette vil ikke overleve en server-restart, og databasen nevnt i spec-en må på plass.
* **Vipps/Stripe webhook logikk:**
  * Endpointet for `/webhook/payment` finnes, men selve betalingsintegrasjonen (å verifisere gyldig betaling fra de faktiske selskapene) er ikke der.

---

## 🧪 3. Hva som må testes
Infrastruktur-kode og samspillet over nettverk må testes i praksis (koden har per nå trolig bare blitt "dry-run" testet).

1. **Docker Socket-integrasjonen:** Orkestratoren sin bruk av `dockerode` må testes på den faktiske Linux-hosten (VPS) for maskinvare-tilgang, slik at man verifiserer at den klarer å spinne opp, stoppe, og exece til nye agenter.
2. **Nettverksisolasjonen:** At NanoClaw-containeren *faktisk ikke* kan nå internett direkte, men *kun* LiteLLM på port 4000.
3. **The Vault & OAuth:** En faktisk autentiseringsflyt gjennom Google som returnerer access og refresh-tokens, krypterer de, og deretter vekker agenten som suksessfullt greier å *dekryptere* det i minnet.
4. **LLM Budsjett-verifisering:** Test at LiteLLM kutter tråden hvis virtual key-en til en bruker når budsjettkravet ($10/mnd).

---

## 🚀 4. Neste steg
For å ferdigstille Minimum Viable Product (MVP) systemet bør vi prioritere følgende oppgaver:

> [!IMPORTANT]
> **1. Bygge den faktiske AI-Agneten (NanoClaw Core i Python)**  
> Gitt at "huset og bankboksen" nå finnes, må selve "assistenten" flytte inn. Vi må bygge `nanoclaw-base` i Python som: 
> * Leser dekrypterte OAuth tokens i minnet.
> * Snakker med LiteLLM Proxy under panseret (Claude/Gemini).
> * Har MCP for Google integrasjoner (Mail, calendar).

**2. Bytte ut In-Memory med Database**  
Sette opp en lett PostgreSQL-database og hekte Orkestratorens token/vault-tjeneste mot denne.

**3. Frontend Onboarding**  
Lage den enkle "3-minutters"-onboardingen (Vipps -> Auth -> Live) i Next.js som brukerne vi se.

**4. Lansere på test-VPS**  
Sette hele stacken opp på en rimelig Hetzner/DigitalOcean VPS og kjøre en E2E test.
