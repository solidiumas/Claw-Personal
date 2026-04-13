# ============================================================
# NanoClaw — Konfigurasjon (Fase 7)
# ============================================================
# Sentralisert konfigurasjon lastet fra miljøvariabler.
#
# Alle variabler injiseres av Orkestratoren ved container-
# opprettelse (se docker.service.js).
#
# Viktige konvensjoner:
#   - OPENAI_API_KEY  = LiteLLM Virtual Key (IKKE ekte OpenAI-nøkkel)
#   - OPENAI_API_BASE = Intern URL til LiteLLM proxy
#   - INTERNAL_TOKEN  = Autentisering mot Orkestratorens Vault API
# ============================================================

import os

# -----------------------------------------------------------
# Bruker-identifikasjon
# -----------------------------------------------------------
USER_ID: str = os.environ.get("USER_ID", "unknown")

# -----------------------------------------------------------
# LLM-konfigurasjon (via LiteLLM proxy)
# -----------------------------------------------------------
# Virtual Key generert av LiteLLM for denne brukeren.
# Gir tilgang til modellene konfigurert i litellm/config.yaml.
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")

# Intern URL til LiteLLM proxy i claw-internal-nettverket.
OPENAI_API_BASE: str = os.environ.get("OPENAI_API_BASE", "http://litellm-proxy:4000")

# Standard modell — mapper til model_name i LiteLLM config.
MODEL_NAME: str = os.environ.get("MODEL_NAME", "claude-sonnet")

# -----------------------------------------------------------
# Orkestrator / Vault-konfigurasjon
# -----------------------------------------------------------
# Intern token for autentisering mot Orkestratoren.
# Brukes i Authorization: Bearer <token> header.
INTERNAL_TOKEN: str = os.environ.get("INTERNAL_TOKEN", "")

# Orkestrator base URL — tilgjengelig via claw-internal nettverk.
ORCHESTRATOR_URL: str = os.environ.get("ORCHESTRATOR_URL", "http://claw-orchestrator:3000")

# -----------------------------------------------------------
# Agent-konfigurasjon
# -----------------------------------------------------------
# Maksimalt antall iterasjoner i action-observation loopen.
# Sikkerhetsmekanisme for å forhindre uendelige loops.
MAX_AGENT_ITERATIONS: int = int(os.environ.get("MAX_AGENT_ITERATIONS", "25"))

# Timeout per LLM-kall i sekunder.
LLM_TIMEOUT: int = int(os.environ.get("LLM_TIMEOUT", "120"))

# Wake-signal filsti (skrevet av Orkestrator via docker exec).
WAKE_SIGNAL_PATH: str = "/tmp/wake.signal"

# Intervall (sekunder) for å sjekke wake-signal.
WAKE_CHECK_INTERVAL: int = int(os.environ.get("WAKE_CHECK_INTERVAL", "2"))
