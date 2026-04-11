# Fane 1

# Hva skal vi gjøre

Vi skal produktifisere Claw-løsninger, i vårt tilfelle NanoClaw, en liten og sikker variant av OpenClaw.

Vi skal bygge en ferdig løsning for privatpersoner/selskapet som leverer ferdig AI Agenter.   
I første versjon så bygger vi produktet for innholdsprodusenter til YouTube / har sine egne YouTube kanaler.

# Produkter består av:

- **Onboarding** løsning  
- **Web/App** løsning for å få oversikt over sin personlige agent. Her kan man ligge til nye skills/tjenester og bygge agenter.  
  - Vår frontend styrer alt som skjer og er koblet mot NanoClaw  
  - API for å snakke mellom frontend og NanoClaw \- for hver enkelt bruker  
- **Backend** løsning  
  - Når eg bruker starter onboarding så skal  
    - Automatisk installere NanoClaw og spinne opp en docker  
    - Claude API på et eller annet vis  
      - Vår løsning for å komme i gang, så ein/fleire API-nøkler for AI.  
  - Koble seg til tjenester gjennom OAuth  
    - Google Mail, Calendar osv  
    - YouTube Channel Stats

## Hva er det vi leverer?

Vi leverer Claw Personal \- en AI Agentløsning klar til bruk. Du onboarder deg selv på 3 minutter så er alt klart til bruk.  
Vi leverer første spesifikke produkt mot YouTube-content-creators.

Etterhvert skal produktet tilpasses vanlige forbrukere og bedrift.

# Teknisk løsning

Full beskrivelse og informasjon om teknisk løsning og alternativer, se:  
[https://docs.google.com/document/d/12Sinj31NX9W4sjfllywpGWq2mRpGeNrsK9aOwO7-ak8/edit?tab=t.0](https://docs.google.com/document/d/12Sinj31NX9W4sjfllywpGWq2mRpGeNrsK9aOwO7-ak8/edit?tab=t.0) 

## Cloud / Maskinvare

For første del så bygger vi løsningen på Contain-isolasjon på en felles VPS. Anbefalt løsning for 10-100 brukere og skal være den billigste løsningen. Sikkerhetsmessig så skal dette være mer enn godt nok, og muligens løsningen på sikt.

Den mest moderne løsningen er MicroVMs (f.eks. [Fly.io](http://Fly.io)), men det blir i fremtiden.

## App løsning

For å koble sammen / bygge onboarding løsning uten menneskelig innblanding, så må vi bygge en “orkestrator” \- det er dette som er kjernen i produktet vårt. Typisk en lettvekts [Node.JS](http://Node.JS/Python) eller Python backend som ligger bak.

Onboarding består av frontend som kunden tar i bruk for oppsett.  
App/webløsning er “portalen” der man kan logge seg inn på AI Agenten og gi nye instrukser.

## Frontend

[Next.js](http://Next.js)? Betyr lite for min del, men må være topp moderne og enkelt å vedlikeholde.

## Backend (kaller vi Orkestrator)

Webhooks

- Fra betalingsleverandør (f.eks. Stripe) som gir vår Orkestrator beskjed om at noen vil starte tjenesten.

[Node.js](http://Node.js) eller Python som backend. Fast API.  
Magic Connect.

**NanoClaw Core (Data Plane):** Kjernekoden skrevet i Python, pakket som et optimalisert Docker-image.

## Database

For metadata, PostgreSQL gjennom Supabase eller Neon som alternativ. Lagrer kun brukerprofiler, kontaktinfo, abonnementsstatus og preferanser (Persona).

## Infrastruktur

Dedikert VPS \- ClawEngineHub (Hostinger, Hetzner Cloud, Digital Ocean). Bør ha flere VPS løsninger der folk velger land/region de kommer fra. Dette for å sikre personvern og at data lagres på riktig lokasjon.  
Her kjøres våre Docker Containers, spinnes opp ved bruk av Docker Deamon

**Vi MÅ LØSE CLAUDE-avhengig på**. [Se teknisk dokument.](https://docs.google.com/document/u/0/d/12Sinj31NX9W4sjfllywpGWq2mRpGeNrsK9aOwO7-ak8/edit)

# Kundeflyt

1. Kunde havner på onboardingsside og betaler/registrerer seg.  
2. Betalingsleverandør sender Webhook til Orkestrator (vår backend) med beskjed om at kunde X har betalt og vil starte tjenesten.  
3. Orkestrator (backend) genererer unikt sett med nøkler for zero-knowledge kryptering (hvelvet) og tildeler kunden en kjørende instans (ny Docker Container).  
4. Kunden onboardes (frontend) og får opp “magic connect” skjermen for OAuth-autorisasjon av Gmail, Google Calendar osv.  
5. Når OAuth-token er lagret i Hvelvet, får den dedikerte NanoClaw-motoren til kunden beskjed om å våkne.  
6. NanoClaw gjør nå første API-kall og begynner å analysere

Problemer med kundeflyten over:

- NanoClaw er AI Native og krever Claude API-nøkkel for å bygges og driftes  
- Vi må automatisk får tak i API-nøkler, eller lage disse i batch og hente de frem fra en .env-fil / liste.

# Simen \- hva er produktet vi selger

Hva selger vi / hva er produktet vi lager?

Vi produserer nanoclaw. Vi skal lage en pakke hvor kunder kan kjøpe en ferdig oppsatt agent/agenter enten gjennom cloud eller en lokal maskin. Produktet skal settes opp kjapt (innen 5 min) og skal da være ferdig konfigurert og klar for bruk for våre brukere (youtube content-creators Nisje). Det vil si at user-agent chat er satt opp, instruksjoner er satt opp, og verktøy er satt opp slik at bruker kan be agenten sette i gang med oppgaver etter onboarding. 

Vi ser for oss å starte med cloud løsningen for youtubere, med muligheter for å utvide til andre nisjer og til privatpersoner etterhvert. Parallelt med utvikling av NanoClaw vil vår ekspertise øke og det kan åpne muligheter for å leie oss ut som AI-konsulenter som hjelper bedrifter med å automatisere bedrifter gjennom bruk av AI og agenter.   
