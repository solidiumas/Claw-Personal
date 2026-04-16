# Fase 8 - Oppdatert Onboarding (Frictionless)

## Mål for fasen
Målet med denne fasen er å gjøre Google Authentication valgfritt under selve onboarding- og kjøpsprosessen for å senke terskelen ("frictionless onboarding"). I stedet for å kreve full Google Auth umiddelbart, skal brukeren kun oppgi sin YouTube-URL eller handle (f.eks. `@Janovich`). Google Auth flyttes i stedet inn i dashbordet som en opt-in funksjon for dypere YouTube-integrasjon i etterkant av kjøpet.

---

## 1. Endringer i Frontend (Onboarding)

Vi må oppdatere informasjonsinnhentingen slik at YouTube-kanalen er det eneste strengt nødvendige for systemet.

*   **Før betaling (Anbefalt)**: Legg til et tekstfelt på landingssiden/prissiden hvor brukeren limer inn sin YouTube-URL eller handle før de trykker "Kjøp nå".
    *   Denne URL-en sendes med som `metadata` til Stripe når Checkout-sesjonen opprettes. Dette er den tryggeste metoden for å knytte betaling mot data.
*   **Alternativt (Etter betaling)**: Brukeren lander på en dedikert side etter betaling hvor de skriver inn URL-en, og denne lagres i databasen via et API-kall til f.eks. `/api/update-user-profile`.
*   **Suksess-side/Dashboard**: Etter alt er provisjonert, blir brukeren sendt til en side som bekrefter at de er i gang. Eksempeltekst: *"Din agent for @Janovich er nå aktivert! Den begynner å analysere videoene dine nå."*

## 2. Endringer i Backend / Orkestrator (Logikken)

Orkestratoren må justeres slik at den ikke "stopper opp" eller avventer en fullført Google OAuth-flow for å anse opprettelsen som ferdig.

*   **Database-utvidelse**: Legg til et nytt felt i `users`-tabellen for å lagre verdien, for eksempel `youtube_handle` eller `channel_url`.
*   **Stripe Webhook**: Orkestratoren sin webhook må hente ut og lagre YouTube-URL-en fra Stripe sine metadata idet betalingen er bekreftet (sammen med brukerens annen info).
*   **Skippe OAuth Redirect**: I stedet for at kjøpsflyten automatisk tvinger en redirect til `http://.../auth/google`, rutes kunden direkte til sitt nye "Dashboard" eller suksess-siden. Dette markerer at provisjoneringen er komplett.
*   **Passe data til Containeren**: Når orkestratoren til slutt trigger start av `nanoclaw-base` containeren, må vi tilgjengeliggjøre kanal-dataen. YouTube-håndtaket (som vi hentet ut ovenfor) skal injiseres som en ny miljøvariabel i oppstarten. 
    *   Eksempelvis: `-e YOUTUBE_CHANNEL="@Janovich"`

*(Note: LiteLLM oppretter nøkkelen helt transparent, akkurat som før)*

## 3. Den Nye Brukerreisen (Steg-for-steg)

1.  **Landingsside**: Brukeren limer inn sin YouTube-URL/handle og trykker "Kjøp nå".
2.  **Stripe Checkout**: Brukeren gjennomfører kortbetaling.
3.  **Webhook-mottak**: Orkestratoren mottar bekreftelsen, leser YouTube-URL-en fra metadataene, og oppretter brukeren i databasen.
4.  **Provisjonering**:
    *   LiteLLM genererer ferdig en ny nøkkel for brukeren.
    *   Containeren startes automatisk, og får vite hvilken YouTube-kanal den skal overvåke via miljøvariabelen.
5.  **Klar**: Brukeren redirectes/ledes til bekreftelses-siden om at analysen er i gang.

## 4. Håndtering av Google-tilgang (Senere)

Google Auth fjernes ikke, men rykker frem som en "Koble til YouTube for dypere innsikt"-call-to-action inne i selve dashbordet. 

*   **Rask onboarding**: Kunder kommer umiddelbart i gang med analyser basert på offentlig tilgjengelig data (kun brukernavn).
*   **Premium funksjoner (tilvalg)**: De brukerne som ønsker at systemet skal kunne samhandle direkte (for eksempel svare på kommentarer automatisk, eller lese privat/kanal-spesifikk statistikk) kan koble til kontoen sin via knappen i dashbordet når de selv er klare. Dette utløser da samme `/auth/google` flyt som tidligere var i onboarding.
