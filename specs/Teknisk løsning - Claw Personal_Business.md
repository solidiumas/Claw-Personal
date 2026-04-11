# Infrastruktur

Hvordan forene kravet om **"Zero Delay/Friction"** med kravet om **"Isolasjon i skyen"**.

For å være helt ærlig med deg: Å spinne opp en helt ny virtuell maskin (VPS) fra bunnen av, installere et operativsystem, laste ned Docker-images og starte applikasjonen tar vanligvis alt fra 2 til 5 minutter. Det bryter med løftet om en "3-minutters onboarding" der systemet skal være klart umiddelbart.

Siden dere allerede har bygget arkitekturen rundt **Docker**, har dere et fantastisk utgangspunkt. Slik løser dere dette teknisk for å få absolutt null forsinkelse, spesielt skalert for de første 15 (eller 150\) brukerne:

## Tre strategier for "Zero Delay" infrastruktur

### 1\. Container-isolasjon på en felles VPS (Anbefalt for 15-100 brukere)

I stedet for å gi hver bruker en egen VPS, kjører dere én (eller noen få) kraftige VPS-er. Når en bruker betaler, spinner systemet umiddelbart opp en ny, isolert **Docker-container** dedikert kun til den brukeren.

* **Hvordan det fungerer:** Dere bruker et verktøy som Docker Swarm, Nomad eller et enkelt skript via et internt API. Betalingen trigger opprettelsen av en ny container (`docker run --name claw-user-123 ...`).  
* **Fart:** Å starte en ny Docker-container tar under 1 sekund. "Zero delay" er oppnådd.  
* **Isolasjon:** Hver bruker har sitt eget isolerte miljø, sitt eget filsystem i containeren, og via "The Vault" (Zero-Knowledge krypteringen dere nevner) er dataene deres trygge, selv om de deler underliggende maskinvare.

### 2\. "Warm Pool" av VPS-er (Hvis dedikert server er et absolutt krav)

Hvis "Claw Cloud"-løftet krever at brukerne har 100 % isolerte virtuelle maskiner for maksimal sikkerhet, kan dere ikke vente på at VPS-en skal bygges ved bestilling.

* **Hvordan det fungerer:** Dere bruker Infrastructure as Code (f.eks. Terraform) til å alltid ha en "Warm Pool" med 5 ferdig oppsatte, ledige VPS-er stående klare (med NanoClaw ferdig installert, men inaktiv).  
* **Når kunden betaler:** Systemet henter den første ledige serveren fra poolen og knytter den til kunden umiddelbart. Samtidig sendes et API-kall til skyleverandøren deres (DigitalOcean, AWS, Hetzner) om å bygge en ny VPS i bakgrunnen for å fylle opp poolen igjen.  
* **Fart:** Umiddelbar for kunden, da de får en server som allerede kjører.

### 3\. MicroVMs / Serverless Containers (Den mest moderne løsningen)

Plattformer som **Fly.io** eller tjenester bygget på **AWS Firecracker** lar deg kjøre Docker-containere som om de var fullverdige, isolerte mikromaskiner (MicroVMs).

* **Hvordan det fungerer:** Hver bruker får sin egen maskinvare-isolerte MicroVM.  
* **Fart:** Firecracker er designet for å starte virtuelle maskiner på *under 100 millisekunder*. Du får VPS-nivå sikkerhet med container-nivå hastighet. Dette er teknologien som driver AWS Lambda.

### Slik blir den tekniske automatiserings-flyten

For å koble alt sammen uten menneskelig innblanding, bygger dere en sentral "Orkestrator" (f.eks. en lettvekts Node.js eller Python-backend bak onboarding-portalen din):

1. **Kjøp & Registrering:** Brukeren betaler via Vipps. Betalingsleverandøren sender en *Webhook* til Orkestratoren deres med beskjed om at "Bruker X har betalt".  
2. **Klargjøring (Backend):** Orkestratoren genererer automatisk et unikt sett med nøkler for Zero-Knowledge krypteringen (The Vault) og tildeler kunden en kjørende instans (enten en ny Docker-container eller en VPS fra "Warm Pool").  
3. **Onboarding (Frontend):** Mens dette skjer i bakgrunnen (tar 1-2 sekunder), sendes brukeren direkte til "Magic Connect"-skjermen for OAuth-autorisasjon mot Gmail og Google Calendar.  
4. **Overtagelse:** Straks OAuth-tokenene er lagret i "The Vault", får den dedikerte NanoClaw-motoren til kunden beskjed om å våkne. Den gjør sitt første API-kall for å analysere innboksen, og assistenten er live.

For et volum på 15 brukere i starten, vil **Løsning 1** (Docker-containere på én felles, kraftig VPS) være suverent billigst, enklest å drifte, og gi den sømløse opplevelsen dere er ute etter.

# Teknisk Stack (The Blueprint)

For å sikre fart og pålitelighet, velger vi velprøvde, moderne teknologier:

* **Frontend (Brukerportal):** Next.js (hostet på Vercel). Lynraskt, perfekt for den enkle 3-minutters onboarding-flyten og "Magic Connect".  
* **Orkestrator (Control Plane):** Python (FastAPI) eller Node.js. Dette er hjernen i systemet som ikke rører AI, men som styrer betaling, brukere og infrastruktur.  
* **Database (Metadata):** PostgreSQL (f.eks. via Supabase eller Neon). Lagrer *kun* brukerprofiler, abonnementsstatus og preferanser (Persona). Ingen e-poster eller kalenderhendelser lagres her.  
* **Infrastruktur (Claw Engine Hub):** En kraftig, dedikert VPS (f.eks. hos Hetzner Cloud eller DigitalOcean). Her kjører Docker Daemon som spinner opp isolerte containere.  
* **NanoClaw Core (Data Plane):** Kjernekoden skrevet i Python, pakket som et optimalisert Docker-image.

## Arkitektur og Komponenter

Systemet deles inn i tre logiske blokker som snakker sammen via sikre API-er.

### 1\. The Gateway (Onboarding & Auth)

Dette er det eneste brukeren ser.

* **Vipps/Stripe Integration:** Håndterer abonnementet. Når et kjøp går gjennom, sendes en webhook til Orkestratoren.  
* **Magic Connect (OAuth2 Proxy):** Håndterer det komplekse OAuth-danset mot Google/Microsoft. Når brukeren godkjenner, sendes tokenene umiddelbart til "The Vault".

### 2\. The Control Plane (Orkestratoren & The Vault)

Dette er systemets "trafikkpoliti" og bankboks.

* **Docker Manager:** Et skript i Orkestratoren som lytter på Webhooks. Når en ny bruker registrerer seg, gjør den et API-kall til VPS-en: `docker run -d --name claw_user_123 nanoclaw:latest`.  
* **The Vault (KMS):** Vi bygger (eller bruker en tjeneste som HashiCorp Vault) en Zero-Knowledge nøkkelhåndterer. OAuth-tokens krypteres med en unik nøkkel per bruker. Databasen vår ser kun "gibberish".

### 3\. The Execution Environment (Container Hub)

Dette er "fabrikken" der assistentene lever.

* Hver bruker får én kjørende, lettvekts Docker-container.  
* Containeren er **Stateless**. Den lagrer ingen data på disken.  
* Når containeren starter, gjør den et sikkert kall til The Vault for å hente (og dekryptere) sine spesifikke e-post/kalender-tokens *kun i minnet (in-memory)*.  
* Containeren har MCP-klientene innebygd, og kommuniserer med Gemini 1.5 Flash (via API) for å utføre "Action-Observation" loopen.

## Den Tekniske Flyten (Slik skjer "Zero Delay")

Slik oppnår vi umiddelbar oppstart når en ny kunde klikker "Kjøp":

1. **T=0.0s:** Kunden betaler via Vipps på mobil/web.  
2. **T=0.5s:** Vipps sender en Webhook til vår Orkestrator.  
3. **T=0.8s:** Orkestratoren oppretter en bruker-ID i PostgreSQL og gjør et kall til vår VPS for å starte en ny Docker-container.  
4. **T=1.5s:** Docker-containeren kjører. NanoClaw-motoren er våken og venter i "standby".  
5. **T=15.0s:** Kunden videresendes til skjermen for å koble til Google/Outlook (Magic Connect). De trykker "Godkjenn".  
6. **T=16.0s:** OAuth-tokens lagres trygt i The Vault.  
7. **T=16.5s:** Orkestratoren pinger den ventende Docker-containeren: *"Du har fått tilgang. Start initialiserings-protokoll."*  
8. **T=17.0s:** NanoClaw-containeren henter tokens i minnet, kobler seg til innboksen, og assistenten er i gang med første ryddejobb.

## Hvorfor denne arkitekturen vinner

* **Identisk kodebase:** Fordi selve assistenten er pakket i et Docker-image, kjører nøyaktig samme kode på vår sky-VPS som den vil gjøre på en fysisk "Claw Box" hjemme hos personvern-entusiasten i fremtiden.  
* **Sikkerhet ved kompromittering:** Hvis én container på en eller annen måte krasjer eller blir utsatt for en minne-lekkasje, påvirker det *kun* den ene brukeren. Cgroups i Docker sørger for at de ikke kan se hverandres prosesser.  
* **Kostnadseffektivt:** En kraftig VPS (f.eks. 16 kjerner, 32GB RAM) hos Hetzner koster kanskje 300-400 kr i måneden. Den kan enkelt drive 15-50 lettvekts Python-containere som primært venter på nettverk (I/O-bound oppgaver). Vi har massiv profittmargin fra dag én.

# LLM og AI Modeller

### **Tre måter å løse Claude-avhengigheten på**

Dere har tre veier å gå, avhengig av hvor mye tid dere vil bruke på koding i Fase 1 vs. hvor fort dere vil ut i markedet.

#### **Løsning 1: "Magisk oversetting" med en AI-Proxy (Anbefalt for uavhengighet)**

Dette er den smarteste måten å "lure" systemet på hvis dere egentlig vil bruke Gemini 1.5 Flash (som planlagt i skyen) eller lokale modeller på sikt, uten å måtte skrive om hele NanoClaw-kildekoden.

* **Verktøyet:** Dere installerer en open-source tjeneste som heter **LiteLLM** som en egen container på VPS-en.  
* **Hvordan det fungerer:** LiteLLM fungerer som et oversettelsesledd. Dere konfigurerer NanoClaw-containeren til å sende "Claude-forespørsler" til LiteLLM i stedet for til Anthropics servere. LiteLLM tar imot Claude-formatet, oversetter det "on the fly" til Gemini-format, sender det til Google, får svar, og oversetter det tilbake til Claude-format for NanoClaw.  
* **Resultat:** NanoClaw *tror* den snakker med Claude, men dere står fritt til å bytte modell i bakgrunnen med én kodelinje.

#### **Løsning 2: "Fork and Refactor" (Anbefalt for langsiktig kontroll)**

Siden NanoClaw er open-source, kloner (forker) dere kildekoden.

* **Hvordan det fungerer:** Dere går inn i Python-koden til motoren og bytter ut de spesifikke Anthropic SDK-kallene med et mer nøytralt rammeverk (som LangChain, LlamaIndex, eller direkte API-kall til den modellen dere ønsker).  
* **Resultat:** Dere eier deres egen versjon av NanoClaw ("Claw Engine") som er bygget nøyaktig slik dere vil ha den. Dette er mer arbeid i Fase 1, men gir total frihet i Fase 3 og 4\.

#### **Løsning 3: Bare bruk Claude (Anbefalt for raskest MVP)**

Hvis målet er å bevise konseptet (Proof of Concept) raskest mulig.

* **Hvordan det fungerer:** Dere aksepterer at versjon 1.0 bruker Claude 3 Haiku eller Sonnet. Anthropic har strenge personvernvilkår for API-et sitt (de trener ikke på API-data), så det kan fremdeles forsvares overfor kundene.  
* **Resultat:** Null ekstra utviklingstid på å skrive om motor-logikken. Dere kan fokusere 100 % på orkestrering, "The Vault" og MCP-integrasjonene.

**Hvordan dette endrer VPS-arkitekturen (Sikkerhet for kundene)**

Når dere skal rulle dette ut som en abonnementsløsning med mange brukere, oppstår et nytt problem: **Hvem sin API-nøkkel betaler for AI-bruken?**

Hvis dere legger deres egen (Claw Personal) Anthropic/Google API-nøkkel direkte inn i hver brukers container, er det en sikkerhetsrisiko. Hvis noen klarer å hente ut miljøvariablene fra sin container, kan de stjele nøkkelen deres og påføre dere enorme kostnader.

**Slik bygger vi oppsettet sikkert for hver kunde:**

1. **Sentral LLM-Gateway:** Vi legger til en ny byggekloss på den delte VPS-en: En **LLM Gateway** (f.eks. LiteLLM-containeren nevnt over, eller en Cloudflare AI Gateway).  
2. **Skjult Master-nøkkel:** Den ekte API-nøkkelen til Claude/Gemini ligger *kun* i Gateway-en, trygt beskyttet av VPS-ens operativsystem.  
3. **Interne Tokens:** Når Orkestratoren spinner opp en ny brukercontainer (NanoClaw for Bruker X), gir den containeren en *midlertidig, intern token* og instruerer den om å sende alle AI-forespørsler til den interne Gateway-en (via Docker-nettverket), ikke til internett.  
4. **Kostnadskontroll:** Gateway-en sjekker den interne tokenen, ser at "Bruker X" spør, videresender forespørselen til Claude/Gemini med Master-nøkkelen, og logger nøyaktig hvor mange tokens Bruker X har brukt. Slik kan dere sette "hard limits" på brukere så de ikke koster dere mer enn abonnementet deres bringer inn.

Denne strukturen sikrer at koden fungerer sømløst, at kundens "Vault" holdes trygg, og at dere har full kontroll på AI-kostnadene.

