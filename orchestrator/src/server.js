// ============================================================
// Claw Personal — Orkestrator (Backend Server)
// ============================================================
// Sentral "Orkestrator" som håndterer onboarding av nye brukere.
//
// Denne Express-serveren gjør følgende:
//
//   Fase 2 (Orkestrator):
//   1. Har et endepunkt (POST /webhook/payment) for å ta imot
//      en bekreftelse på at en bruker har betalt.
//   2. Spinner opp isolerte NanoClaw-containere per bruker.
//   3. Genererer interne tokens og Virtual Keys.
//
//   Fase 3 (Magic Connect):
//   4. OAuth 2.0 mot Google for Gmail, Calendar og YouTube.
//   5. Krypterer tokens i «The Vault» (Zero-Knowledge).
//   6. Sender wake-signal til brukerens NanoClaw-container.
//
//   Fase 4 (Database):
//   7. PostgreSQL for persistent lagring av brukere og tokens.
//   8. Automatisk schema-migrasjon ved oppstart.
//
//   Fase 5 (Stripe):
//   9. Stripe Checkout Session for betaling.
//  10. Signaturverifisert webhook med Zero-Delay provisjonering.
//
//   Fase 6 (Frontend):
//  11. CORS for cross-origin API-kall fra Next.js frontend.
//  12. OAuth-callback redirect til frontend etter autentisering.
//
// Bruk:
//   NODE_ENV=development node src/server.js
//
// Helse-sjekk:
//   curl http://localhost:3000/health
// ============================================================

const express = require('express');
const session = require('express-session');
const config = require('./config');
const db = require('./db/pool');
const migrate = require('./db/migrate');
const webhookRoutes = require('./routes/webhook.routes');
const authRoutes = require('./routes/auth.routes');
const checkoutRoutes = require('./routes/checkout.routes');
const vaultRoutes = require('./routes/vault.routes');

// -----------------------------------------------------------
// Opprett Express-app
// -----------------------------------------------------------
const app = express();

// -----------------------------------------------------------
// Middleware
// -----------------------------------------------------------

// KRITISK (Fase 5): Stripe webhook-ruten MÅ bruke express.raw()
// for at signaturverifisering skal fungere. Dette MÅ defineres
// FØR express.json() globalt, ellers ødelegges body-bufferen.
app.use('/webhook/payment', express.raw({ type: 'application/json' }));

// Parse JSON request bodies (alle andre ruter)
app.use(express.json());

// CORS (Fase 6): Frontend-portalen kjører på en annen port/domene.
// Tillat cross-origin requests fra den konfigurerte frontend-URL-en.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Session middleware (Fase 3) — kreves for OAuth CSRF-beskyttelse.
// Sesjonen lagrer state-parameter og userId under OAuth-flyten.
//
// PRODUKSJON: Bytt ut MemoryStore med Redis eller PostgreSQL
// for horisontal skalering:
//   const RedisStore = require('connect-redis').default;
//   store: new RedisStore({ client: redisClient })
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  name: 'claw.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // HTTPS i prod
    httpOnly: true,                                  // Utilgjengelig for JS
    maxAge: 10 * 60 * 1000,                         // 10 minutter
    sameSite: 'lax',                                 // CSRF-beskyttelse
  },
}));

// Enkel request-logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// -----------------------------------------------------------
// Ruter
// -----------------------------------------------------------

// Helse-endepunkt (inkluderer DB-status)
app.get('/health', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  res.status(200).json({
    status: 'ok',
    service: 'claw-orchestrator',
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Webhook-ruter (Fase 2 + 5: Stripe SDK)
app.use('/webhook', webhookRoutes);

// OAuth / Magic Connect-ruter (Fase 3)
app.use('/auth', authRoutes);

// Checkout / Betaling-ruter (Fase 5)
app.use('/api', checkoutRoutes);

// Vault API-ruter (Fase 7: NanoClaw Data Plane)
// Internt API for NanoClaw-containere til å hente dekrypterte tokens
app.use('/vault', vaultRoutes);

// -----------------------------------------------------------
// Container-status polling (Fase 6: Onboarding)
// -----------------------------------------------------------
// Frontenden poller dette endepunktet hvert 3. sekund mens
// brukeren er på onboarding-skjermen, for å vite når
// NanoClaw-containeren er klar og kunden kan koble til Google.
//
// Returnerer:
//   { status: 'provisioning' }  — Betalt, container spinnes opp
//   { status: 'running' }       — Container kjører, klar for OAuth
//   { status: 'not_found' }     — Ukjent bruker-ID
//   { status: 'error' }         — Noe gikk galt
// -----------------------------------------------------------
app.get('/api/container-status/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      `SELECT license_status, container_id, container_name
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'not_found' });
    }

    const { license_status, container_id, container_name } = result.rows[0];

    // Container er registrert i DB — sjekk om den faktisk kjører
    if (container_name && container_id) {
      return res.json({
        status: 'running',
        containerName: container_name,
        licenseStatus: license_status,
      });
    }

    // Betaling godkjent, men container er ikke klar enda
    if (license_status === 'active') {
      return res.json({ status: 'provisioning', licenseStatus: license_status });
    }

    // Betaling venter (Stripe ikke kalt tilbake enda)
    return res.json({ status: 'provisioning', licenseStatus: license_status });

  } catch (err) {
    console.error(`[ContainerStatus] Feil for bruker ${userId}: ${err.message}`);
    return res.status(500).json({ status: 'error', message: 'Intern feil' });
  }
});

// -----------------------------------------------------------
// 404 handler
// -----------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endepunkt ikke funnet',
  });
});

// -----------------------------------------------------------
// Global feilhåndtering
// -----------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error(`[Server] Uventet feil: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Intern serverfeil',
  });
});

// -----------------------------------------------------------
// Start serveren (Fase 4: DB-initialisering før oppstart)
// -----------------------------------------------------------
const PORT = config.server.port;
const HOST = config.server.host;

async function start() {
  try {
    // 1. Test databasetilkobling
    await db.testConnection();

    // 2. Kjør schema-migrasjon (idempotent)
    await migrate();

    // 3. Start Express-serveren
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('============================================================');
      console.log(' Claw Personal — Orkestrator (v0.4.0 — Fase 7)');
      console.log('============================================================');
      console.log(` Server kjører på http://${HOST}:${PORT}`);
      console.log(` Helse-sjekk:     http://${HOST}:${PORT}/health`);
      console.log(` Database:        ✅ PostgreSQL tilkoblet`);
      console.log('');
      console.log(' Fase 2/5 — Webhooks (Stripe):');
      console.log(`   POST http://${HOST}:${PORT}/webhook/payment`);
      console.log('');
      console.log(' Fase 3 — Magic Connect (OAuth):');
      console.log(`   GET  http://${HOST}:${PORT}/auth/google?userId=xxx`);
      console.log(`   GET  http://${HOST}:${PORT}/auth/google/callback`);
      console.log(`   GET  http://${HOST}:${PORT}/auth/status/:userId`);
      console.log('');
      console.log(' Fase 5 — Betaling (Stripe Checkout):');
      console.log(`   POST http://${HOST}:${PORT}/api/create-checkout-session`);
      console.log('');
      console.log(' Fase 7 — Vault API (NanoClaw Data Plane):');
      console.log(`   GET  http://${HOST}:${PORT}/vault/tokens`);
      console.log(`   POST http://${HOST}:${PORT}/vault/tokens/refresh`);
      console.log('============================================================');
      console.log('');
    });
  } catch (err) {
    console.error('[Server] Kunne ikke starte:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown — lukk DB-tilkoblinger
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM mottatt. Lukker tilkoblinger...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT mottatt. Lukker tilkoblinger...');
  await db.close();
  process.exit(0);
});

start();
