// ============================================================
// Claw Personal — Orkestrator (Backend Server)
// ============================================================
// Sentral "Orkestrator" som håndterer onboarding av nye brukere.
//
// Denne Express-serveren gjør følgende:
//
//   1. Har et endepunkt (POST /webhook/payment) for å ta imot
//      en bekreftelse på at en bruker har betalt.
//
//   2. Når betalingen er bekreftet, bruker den Dockerode-
//      biblioteket til å umiddelbart spinne opp en ny Docker-
//      container (nanoclaw-base:latest) for brukeren.
//      Containeren kalles claw-user-{userId}.
//
//   3. Orkestratoren genererer en tilfeldig intern streng
//      ('Intern Token'), injiserer den som miljøvariabel
//      i den nye containeren, og lagrer koblingen mellom
//      brukerID og token sikkert.
//
// Bruk:
//   NODE_ENV=development node src/server.js
//
// Helse-sjekk:
//   curl http://localhost:3000/health
// ============================================================

const express = require('express');
const config = require('./config');
const webhookRoutes = require('./routes/webhook.routes');

// -----------------------------------------------------------
// Opprett Express-app
// -----------------------------------------------------------
const app = express();

// -----------------------------------------------------------
// Middleware
// -----------------------------------------------------------
// Parse JSON request bodies
app.use(express.json());

// Enkel request-logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// -----------------------------------------------------------
// Ruter
// -----------------------------------------------------------

// Helse-endepunkt
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'claw-orchestrator',
    timestamp: new Date().toISOString(),
  });
});

// Webhook-ruter
app.use('/webhook', webhookRoutes);

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
// Start serveren
// -----------------------------------------------------------
const PORT = config.server.port;
const HOST = config.server.host;

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('============================================================');
  console.log(' Claw Personal — Orkestrator');
  console.log('============================================================');
  console.log(` Server kjører på http://${HOST}:${PORT}`);
  console.log(` Helse-sjekk:     http://${HOST}:${PORT}/health`);
  console.log(` Webhook:         POST http://${HOST}:${PORT}/webhook/payment`);
  console.log('============================================================');
  console.log('');
});
