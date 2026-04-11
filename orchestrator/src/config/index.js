// ============================================================
// Claw Personal — Orkestrator Konfigurasjon
// ============================================================
// Sentralisert konfigurasjon lastet fra miljøvariabler.
// Alle innstillinger samles her for enkel oversikt og vedlikehold.
// ============================================================

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
};

module.exports = config;
