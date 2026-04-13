// ============================================================
// Claw Personal — Orkestrator Konfigurasjon
// ============================================================
// Sentralisert konfigurasjon lastet fra miljøvariabler.
// Alle innstillinger samles her for enkel oversikt og vedlikehold.
//
// Fase 1: Server, Docker, LiteLLM
// Fase 3: Google OAuth, Vault (Zero-Knowledge), Session
// Fase 4: Database (PostgreSQL)
// Fase 5: Stripe Betalingsintegrasjon
// ============================================================

const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const config = {
  // -----------------------------------------------------------
  // Server-innstillinger
  // -----------------------------------------------------------
  server: {
    port: parseInt(process.env.ORCHESTRATOR_PORT, 10) || 3000,
    host: process.env.ORCHESTRATOR_HOST || '0.0.0.0',
  },

  // -----------------------------------------------------------
  // Docker-innstillinger
  // -----------------------------------------------------------
  docker: {
    // Docker-image for NanoClaw brukercontainere
    nanoclawImage: process.env.NANOCLAW_IMAGE || 'nanoclaw-base:latest',
    // Lukket internt nettverk der brukercontainere kjører
    networkName: process.env.DOCKER_NETWORK || 'claw-internal',
    // Ressursbegrensninger per container
    memoryLimit: parseInt(process.env.CONTAINER_MEMORY_LIMIT, 10) || 512 * 1024 * 1024, // 512 MB
    cpuQuota: parseInt(process.env.CONTAINER_CPU_QUOTA, 10) || 50000, // 0.5 CPU
    cpuPeriod: 100000,
    // Restart-policy
    restartPolicy: { Name: 'unless-stopped' },
  },

  // -----------------------------------------------------------
  // LiteLLM Proxy-innstillinger
  // -----------------------------------------------------------
  litellm: {
    // Intern URL til LiteLLM proxy (tilgjengelig via claw-internal nettverk)
    internalUrl: process.env.LITELLM_INTERNAL_URL || 'http://litellm-proxy:4000',
    // Master Key for admin-operasjoner (opprettelse av Virtual Keys)
    masterKey: process.env.LITELLM_MASTER_KEY || '',
    // Modeller tilgjengelig for brukercontainere
    allowedModels: ['claude-sonnet', 'claude-haiku'],
    // Budsjett per bruker (USD)
    userBudget: parseFloat(process.env.USER_BUDGET) || 10,
    // Budsjettperiode
    budgetDuration: process.env.BUDGET_DURATION || '30d',
    // Standard modell for NanoClaw-containere
    defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet',
  },

  // -----------------------------------------------------------
  // Google OAuth 2.0 — «Magic Connect» (Fase 3)
  // -----------------------------------------------------------
  // Disse verdiene hentes fra Google Cloud Console:
  //   https://console.cloud.google.com/apis/credentials
  //
  // Krever aktiverte API-er:
  //   - Gmail API
  //   - Google Calendar API
  //   - YouTube Analytics API
  //   - YouTube Data API v3
  // -----------------------------------------------------------
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
    // Scopes for NanoClaw — kun lesetilgang!
    scopes: [
      'openid',                                              // OpenID Connect
      'email',                                               // Brukerens e-postadresse
      'profile',                                             // Grunnleggende profilinfo
      'https://www.googleapis.com/auth/gmail.readonly',      // Les e-post (aldri send/slett)
      'https://www.googleapis.com/auth/calendar.readonly',   // Les kalenderhendelser
      'https://www.googleapis.com/auth/yt-analytics.readonly', // YouTube-kanalstatistikk
      'https://www.googleapis.com/auth/youtube.readonly',    // YouTube-kanalinfo og videoer
    ],
  },

  // -----------------------------------------------------------
  // The Vault — Zero-Knowledge Kryptering (Fase 3)
  // -----------------------------------------------------------
  // Master Key brukes til å avlede bruker-spesifikke nøkler.
  // Generer med: openssl rand -hex 32
  // -----------------------------------------------------------
  vault: {
    masterKey: process.env.VAULT_MASTER_KEY || '',
    encryptionAlgorithm: 'aes-256-gcm',
    keyDerivation: 'scrypt',
  },

  // -----------------------------------------------------------
  // Session — For CSRF-beskyttelse i OAuth-flyten (Fase 3)
  // -----------------------------------------------------------
  session: {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  },

  // -----------------------------------------------------------
  // Database — PostgreSQL (Fase 4)
  // -----------------------------------------------------------
  // Tilkoblingsstreng konfigureres via DATABASE_URL.
  // Internt i Docker-nettverket brukes 'db' som vertsnavn.
  // -----------------------------------------------------------
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://claw_admin:claw_secret@db:5432/claw_db',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 20,
    idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,
    connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) || 5000,
  },

  // -----------------------------------------------------------
  // Stripe — Betalingsintegrasjon (Fase 5)
  // -----------------------------------------------------------
  // secretKey:      Fra Stripe Dashboard → Developers → API Keys
  // webhookSecret:  Fra Stripe Dashboard → Webhooks → Signing secret
  // priceId:        ID-en til abonnementsproduktet i Stripe
  // -----------------------------------------------------------
  stripe: {
    secretKey:        process.env.STRIPE_SECRET_KEY || '',
    webhookSecret:    process.env.STRIPE_WEBHOOK_SECRET || '',
    priceId:          process.env.STRIPE_PRICE_ID || '',
    successUrl:       process.env.STRIPE_SUCCESS_URL || 'http://localhost:3001/magic-connect',
    cancelUrl:        process.env.STRIPE_CANCEL_URL || 'http://localhost:3001/',
  },
};

module.exports = config;
