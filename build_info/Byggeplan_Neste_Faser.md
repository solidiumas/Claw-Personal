# Byggeplan og Delegering: Claw Personal (Neste Faser)

Dette dokumentet gir oversikten over hva som gjenstår, hvem som har ansvaret for de ulike oppgavene (fordeling blant agentene), og den logiske bykkerekkefølgen frem mot lansering av MVP.

## Tilgjengelige Agenter
* **Research Agent:** Analyserer, planlegger og undersøker tekniske veivalg.
* **Infra builder:** Infrastruktur, nettverk og servertjenester (Docker).
* **Orkestrator builder:** Backend-applikasjon (Node.js/Express) og flytkontroll.
* **Onboarding & Auth builder:** Brukergrensesnitt og autorisasjonsflyter.
* **AI Agent Builder:** Kjernelogikken som utgjør systemets intelligens (Python/LLM).

---

## Byggerekkefølge og Delegeringsplan

For at systemet ikke skal feile, må vi bygge fra bunnen og oppover (Database -> Betaling -> Brukergrensesnitt -> AI-motor).

### 🛠️ Fase 4: Database & Sikker Lagring
For å gå fra et *mockup*-stadie til produksjon, må de midlertidige In-Memory-kartene for lagring av tilkoblingsinformasjon (Tokens og brukere) byttes ut med en database.

* **Oppgave 1: Infrastruktur for database**
  * **Ansvarlig:** `Infra Builder`
  * **Hva gjøres:** Legger til en PostgreSQL-tjeneste i `docker-compose.yml`, konfigurerer krypterte datavolumer og beskytter databasen i `claw-internal`-nettverket. Legge til miljøvariabler for DB-tilkobling.
* **Oppgave 2: Bygge Database Models**
  * **Ansvarlig:** `Orkestrator builder`
  * **Hva gjøres:** Modifiserer Node.js/Express-miljøet (`token.service.js` og `vault.service.js`) til å bruke PostgreSQL. Oppretter et fungerende schema med brukere, lisens-status, og kryptert token-data for The Vault.

### 💳 Fase 5: Betalingsintegrasjon (Stripe)
Tidligere dokumentasjon nevnte Vipps, men det er nå besluttet at systemet bruker Stripe for kort og webhook-events.

* **Oppgave 1: Stripe Analyse**
  * **Ansvarlig:** `Research Agent`
  * **Hva gjøres:** Undersøke Stripe Webhooks for "Zero-Delay", og optimalisere arkitekturen (Payment Intents vs. Checkout Sessions) for å garantere responstid under onboarding.
* **Oppgave 2: Implementering av Wehbook**
  * **Ansvarlig:** `Orkestrator builder`
  * **Hva gjøres:** Fullføre `/webhook/payment`-ruten ved hjelp av Stripe SDK (signaturverifisering dechiffrering av webhook-events). Koble velykket betalings-webhook direkte på opprettelsen av bruker-ID i den nye Databasen.

### 🖥️ Fase 6: Frontend Portal ("The Gateway" - UI)
Dette er portalen kunden faktisk ser og samhandler med når de oppretter en konto og autoriserer NanoClaw.

* **Oppgave 1: Next.js Portalen**
  * **Ansvarlig:** `Onboarding & Auth builder`
  * **Hva gjøres:** Sette opp en frontend. Felles landingsside for integrasjon av Swipe/Checkout for betaling. "Magic Connect"-skjermen – Onboarding med Google Login. Implementerer en visuell status for at backenden har spinnet opp containeren vellykket. 

### 🧠 Fase 7: NanoClaw-motoren (Data Plane)
Selve AI-applikasjonen – selve produktet. Dette er miljøet som spinnes opp isolert for enhver betalende kunde.

* **Oppgave 1: AI Agent & LLM Kommunikasjon**
  * **Ansvarlig:** `AI Agent Builder`
  * **Hva gjøres:** Bygger det faktiske Docker-image (`nanoclaw-base:latest`) som det refereres til i Fase 1 og 2-skriptene. Et Python-miljø som:
    - Autentiserer mot LiteLLM for API-tilgang i nettverket.
    - Autentiserer seg opp mot The Vault gjennom det interne nettverket for å be om dekryptering av brukerens spesifikke tokens.
    - Gjør kall mot GMail og Kalender API ved hjelp av Model Context Protocol (MCP).
    - Inneholder den "action-observation" agentiske loopen.

---

## Hvordan starte utviklingen
Så snart denne planen godkjennes, bør vi kalle på `Infra Builder` for å fullføre PostgreSQL infrastruktur (Fase 4, del 1), for umiddelbart å ha et fundament før man overlater det til `Orkestrator Builder`.
