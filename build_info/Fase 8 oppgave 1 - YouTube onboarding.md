# Fase 8, Oppgave 1 — Oppdatert Onboarding (YouTube-URL før betaling)

**Dato:** 2026-04-20  
**Status:** ✅ Implementert

---

## Hva ble gjort

Onboarding-flyten er restrukturert slik at YouTube-kanalen er det **eneste strengt nødvendige** steget. Google OAuth er nå valgfritt og flyttes inn i dashbordet.

### Ny brukerflyt

```
Landingsside → Skriv inn YouTube-URL → "Aktiver agent — 99 kr/mnd"
  → Stripe Checkout (YouTube-handle i metadata)
  → Betaling OK → /dashboard?userId=xxx&handle=@Janovich
  → "Din agent for @Janovich er nå aktivert!"
  → (Valgfritt) Koble til Google fra dashbordet
```

---

## Endrede filer (9 stk)

| Fil | Endring |
|---|---|
| `orchestrator/src/db/schema.sql` | +`youtube_handle`, +`channel_url` i `users`-tabell + ALTER TABLE |
| `orchestrator/src/routes/checkout.routes.js` | Ny `parseYoutubeHandle()`-funksjon, validering, lagring i DB, videresending til Stripe |
| `orchestrator/src/services/stripe.service.js` | `youtubeHandle` i Stripe `metadata`, `success_url` → `/dashboard` |
| `orchestrator/src/routes/webhook.routes.js` | Henter `youtube_handle` fra `session.metadata` og lagrer ved `checkout.session.completed` |
| `frontend/src/app/page.js` | YouTube URL-felt (required) med klient-validering, sender `youtubeUrl` til API |
| `frontend/src/app/page.module.css` | Nye stiler: `.urlWrapper`, `.urlInput`, `.urlError`, `.urlSuccess`, `.heroNote` |
| `frontend/src/app/dashboard/page.js` | **NY side** — suksess-side etter betaling |
| `frontend/src/app/dashboard/page.module.css` | **NY fil** — stiler for dashbordet |
| `.env.example` | `STRIPE_SUCCESS_URL` endret til `/dashboard` |

---

## Detaljer

### YouTube URL-parsing (backend)
Støtter alle vanlige formater:
- `https://youtube.com/@Janovich` → `@Janovich`
- `https://www.youtube.com/@Janovich` → `@Janovich`
- `https://youtube.com/c/ChannelName` → `@ChannelName`
- `@Janovich` → `@Janovich`
- `Janovich` → `@Janovich`

### Database
- Ny kolonne `youtube_handle VARCHAR(255)` lagrer normalisert handle
- Ny kolonne `channel_url TEXT` lagrer originalinput fra bruker
- `COALESCE`-logikk i webhook sikrer at eksisterende handle ikke overskrives av tom verdi

### Dashboard-siden (`/dashboard`)
- Viser: *"Din agent for @Janovich er nå aktivert!"*
- Tre pulserende status-indikatorer (agent, abonnement, container)
- Roterende gradient-ring rundt robot-emoji
- Valgfri "Koble til Google"-knapp (ikke blokkerende)
- Link til full status-side

### Google OAuth — nå valgfritt
- Kjøpsflyten redirecter **ikke** lenger til `/auth/google`
- Brukeren sendes direkte til `/dashboard` etter betaling
- Google-knappen er tilgjengelig fra dashbordet som opt-in

---

## Lokal testing

For å teste uten ekte Stripe:
1. Start systemet: `docker compose up --build -d`
2. Åpne: `http://localhost:3001`
3. Lim inn f.eks. `@TestKanal` i feltet → klikk "Aktiver agent"
4. Sjekk uten Stripe: åpne `http://localhost:3001/dashboard?userId=test&handle=@TestKanal` direkte
