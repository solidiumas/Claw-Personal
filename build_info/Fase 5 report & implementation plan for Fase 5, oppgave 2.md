# Report & Implementation Plan: Fase 5, Oppgave 2
## Implementering av Stripe Webhook & Betalingsintegrasjon

---

## 1. Oppgavebeskrivelse

Fra `Byggeplan_Neste_Faser.md`:

> **Fase 5, Oppgave 2: Implementering av Webhook**
> *Ansvarlig: Orkestrator builder*
> Fullføre `/webhook/payment`-ruten ved hjelp av Stripe SDK (signaturverifisering og dechiffrering av webhook-events). Koble vellykket betalings-webhook direkte på opprettelsen av bruker-ID i den nye databasen.

Research Agent (Oppgave 1) leverte følgende arkitekturanbefalinger:
- **Bruk Checkout Sessions** (`mode: subscription`) — ikke Payment Intents
- **Implementer `express.raw()`** FØR `express.json()` på webhook-ruten (kritisk for signaturverifisering)
- **Returner `200 OK` umiddelbart** — kjør provisjonering med `setImmediate()` (Ack-First)
- **Bruk idempotency** mot event.id i PostgreSQL for å forhindre dobbel-provisjonering

---

## 2. Løsningsarkitektur

### Betalingsflyt (end-to-end)

```
Bruker klikker "Kjøp" på frontend
  → POST /api/create-checkout-session
  → Orkestrator oppretter bruker i DB (status: 'pending')
  → Oppretter Stripe Checkout Session med client_reference_id=userId
  → Frontend redirectes til Stripe hosted betalingsside
  → Bruker betaler med kort
  → Stripe sender POST /webhook/payment (checkout.session.completed)
  → Orkestrator verifiserer signatur (<5ms)
  → Sjekker idempotency mot processed_events (DB)
  → Returnerer 200 OK til Stripe umiddelbart ← Zero-Delay!
  → setImmediate() → provisionUser() i bakgrunnen:
       - Generer intern token (DB)
       - Opprett LiteLLM Virtual Key
       - Spawn NanoClaw Docker-container
       - Oppdater users-tabellen med container-info
  → Stripe redirecter bruker til Magic Connect
```

### Zero-Delay mønster (Ack-First)

```
Stripe POST
    │
    ├─ 1. Verifiser signatur    (<5ms)
    ├─ 2. Sjekk idempotency     (<10ms, DB)
    ├─ 3. res.json(received)    ← Stripe er fornøyd
    └─ 4. setImmediate(handle)  → bakgrunn:
              provisjonering (~1-3 sek)
```

---

## 3. Implementerte endringer

### Nye filer (2 stk)

| Fil | Formål |
|-----|--------|
| `orchestrator/src/services/stripe.service.js` | Stripe SDK wrapper: `createCheckoutSession()` og `constructEvent()` |
| `orchestrator/src/routes/checkout.routes.js` | `POST /api/create-checkout-session` — oppretter bruker + Stripe Session |

### Modifiserte filer (6 stk)

| Fil | Endring |
|-----|---------|
| `orchestrator/src/routes/webhook.routes.js` | **Komplett rewrite** med Stripe SDK, 5 event-handlere, Ack-First, idempotency |
| `orchestrator/src/server.js` | `express.raw()` FØR `express.json()` for webhook-ruten, checkout-ruter registrert, v0.3.0 |
| `orchestrator/src/db/schema.sql` | Ny `processed_events`-tabell, `stripe_customer_id`/`stripe_subscription_id`-kolonner på `users` |
| `orchestrator/src/config/index.js` | Ny `stripe`-seksjon med secretKey, webhookSecret, priceId, redirectURLer |
| `orchestrator/package.json` | `stripe ^17.7.0` lagt til, versjon → 0.3.0 |
| `docker-compose.yml` | Alle 5 Stripe-miljøvariabler lagt til for orkestrator-tjenesten |
| `.env.example` | Komplett Stripe-seksjon med forklaringer for alle variabler |

---

## 4. Håndterte Stripe-events

| Event | Handling |
|-------|----------|
| `checkout.session.completed` | **Provisjonerer** bruker: token, LiteLLM Virtual Key, Docker-container |
| `invoice.paid` | Setter `license_status = 'active'` ved månedlig fornyelse |
| `invoice.payment_failed` | Setter `license_status = 'expired'`, klar for e-postvarsling |
| `customer.subscription.deleted` | `license_status = 'revoked'`, stopper og fjerner Docker-container |
| `customer.subscription.updated` | Mapper Stripe subscription-status til intern lisensstatus |

---

## 5. Sikkerhet og idempotency

- **Signaturverifisering:** `stripe.webhooks.constructEvent()` med HMAC-SHA256. Alle uverifiserte requests avvises med `400`.
- **`express.raw()` FØR `express.json()`:** Kritisk registreringsrekkefølge i `server.js`. Uten dette ødelegges body-bufferen og signaturen er alltid ugyldig.
- **Idempotency:** `processed_events`-tabellen lagrer `stripe_event_id` med `PRIMARY KEY`. Race conditions håndteres via PostgreSQL unique constraint brudd (`error.code === '23505'`).

---

## 6. Ny miljøkonfigurasjon (Stripe Dashboard)

```env
STRIPE_SECRET_KEY=sk_test_...          # API Keys → Secret key
STRIPE_WEBHOOK_SECRET=whsec_...        # Webhooks → Signing secret
STRIPE_PRICE_ID=price_...             # Produktet ditt i Stripe
STRIPE_SUCCESS_URL=https://app.clawpersonal.no/magic-connect
STRIPE_CANCEL_URL=https://app.clawpersonal.no/
```

> **Stripe CLI for lokal testing:**
> ```bash
> stripe listen --forward-to localhost:3000/webhook/payment
> stripe trigger checkout.session.completed
> ```

---

## 7. Status etter Fase 5

Betalingsintegrasjonen er fullstendig implementert. Systemet er klart for:

- **Fase 6:** Frontend Portal (Next.js) som kaller `POST /api/create-checkout-session`
- **Fase 7:** NanoClaw-motoren som spinner opp i Docker-containeren

**Tjenesten er nå klar for Fase 6: Frontend Portal.**
