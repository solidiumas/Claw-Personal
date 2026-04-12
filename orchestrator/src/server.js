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

// -----------------------------------------------------------
// Opprett Express-app
// -----------------------------------------------------------
const app = express();

// -----------------------------------------------------------
// Middleware
// -----------------------------------------------------------
// Parse JSON request bodies
app.use(express.json());

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

// Webhook-ruter (Fase 2)
app.use('/webhook', webhookRoutes);

// OAuth / Magic Connect-ruter (Fase 3)
app.use('/auth', authRoutes);

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
      console.log(' Claw Personal — Orkestrator (v0.2.0)');
      console.log('============================================================');
      console.log(` Server kjører på http://${HOST}:${PORT}`);
      console.log(` Helse-sjekk:     http://${HOST}:${PORT}/health`);
      console.log(` Database:        ✅ PostgreSQL tilkoblet`);
      console.log('');
      console.log(' Fase 2 — Webhooks:');
      console.log(`   POST http://${HOST}:${PORT}/webhook/payment`);
      console.log('');
      console.log(' Fase 3 — Magic Connect (OAuth):');
      console.log(`   GET  http://${HOST}:${PORT}/auth/google?userId=xxx`);
      console.log(`   GET  http://${HOST}:${PORT}/auth/google/callback`);
      console.log(`   GET  http://${HOST}:${PORT}/auth/status/:userId`);
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
