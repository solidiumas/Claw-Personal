# Tests — ANTHROPIC_BASE_URL / OPENAI_API_BASE Verifisering

Denne mappen inneholder test-rammeverket som verifiserer at NanoClaw-agenten
ruter **all LLM-trafikk gjennom LiteLLM-proxyen** og aldri direkte til Anthropic.

> **Arkitektur-mapping:**
> `ANTHROPIC_BASE_URL` i test-planen = `OPENAI_API_BASE` i dette prosjektet.
> NanoClaw bruker OpenAI SDK mot LiteLLM, ikke Anthropic SDK direkte.
>
> ```
> NanoClaw Container
>   └─ OpenAI SDK (OPENAI_API_BASE=http://litellm-proxy:4000)
>         └─ LiteLLM proxy (oversetter til Anthropic format)
>               └─ Anthropic API (claude-sonnet-4)
> ```

---

## Filer

| Fil | Fase | Formål |
|-----|------|--------|
| `fase1_litellm_health.sh` | 1 | Helse og modell-verifisering av LiteLLM |
| `fase2_base_url_routing.py` | 2 | Verifiser at `OPENAI_API_BASE` respekteres |
| `fase3_litellm_logging.sh` | 3 | Bevis at LiteLLM mottok og logget requesten |
| `fase4_agent_container_spawn.sh` | 4 | Spawn NanoClaw-container og verifiser routing + isolasjon |
| `run_all_tests.sh` | — | **Master runner** — kjør alle 4 faser |

---

## Forutsetninger

1. **Docker Compose er oppe** med minst LiteLLM:
   ```bash
   docker compose up -d litellm-proxy
   ```

2. **nanoclaw-base image er bygget** (kun Fase 4):
   ```bash
   docker build -t nanoclaw-base:latest ./nanoclaw
   ```

3. **Env-variabler er satt** (se `.env.example`):
   ```bash
   source .env
   ```

---

## Kjøring

### Alle faser (anbefalt)
```bash
source .env
bash tests/run_all_tests.sh
```

### Enkeltfaser
```bash
# Fase 1 — LiteLLM helse
bash tests/run_all_tests.sh --fase 1

# Fase 2 — Base URL routing (Python)
bash tests/run_all_tests.sh --fase 2

# Fase 3 — LiteLLM logging
bash tests/run_all_tests.sh --fase 3

# Fase 4 — Container spawn (krever nanoclaw-base image)
bash tests/run_all_tests.sh --fase 4

# Hopp over Fase 4 (hvis image ikke er bygget ennå)
bash tests/run_all_tests.sh --skip-fase4
```

### Direkte (uten runner)
```bash
# Fase 2 direkte med Python
export OPENAI_API_BASE=http://localhost:4000
export OPENAI_API_KEY=sk-litellm-...
python3 tests/fase2_base_url_routing.py
```

---

## Forventet output (bestått)

```
╔══════════════════════════════════════════════════════════╗
║                      SLUTTRAPPORT                       ║
╠══════════════════════════════════════════════════════════╣
║    Kjøretid: 42s                                         ║
║                                                          ║
║    ✅ Fase 1 (LiteLLM Helse & Modell-verifisering) [8s] ║
║    ✅ Fase 2 (OPENAI_API_BASE Routing via LiteLLM) [12s]║
║    ✅ Fase 3 (Avansert validering — LiteLLM Logger) [6s]║
║    ✅ Fase 4 (Agent Container Spawn & Isolasjon) [16s]  ║
║                                                          ║
║    Faser bestått: 4 / 4                                  ║
╠══════════════════════════════════════════════════════════╣
║  🎉 ALLE TESTER BESTÅTT                                  ║
╚══════════════════════════════════════════════════════════╝
```

---

## Fallback-strategi

Hvis noe feiler (ref. test-planen):

| Problem | Løsning |
|---------|---------|
| Fase 2 feiler — base URL ignoreres | Sjekk at `OPENAI_API_BASE` er satt uten trailing `/v1` i docker.service.js |
| Fase 4 feiler — container når internett | Verifiser `claw-internal: internal: true` i docker-compose.yml |
| LiteLLM returnerer 401 | Sjekk at `OPENAI_API_KEY` er en gyldig LiteLLM Virtual Key eller Master Key |
| `nanoclaw-base:latest` ikke funnet | `docker build -t nanoclaw-base:latest ./nanoclaw` |

> **Note om `OPENAI_API_BASE` i docker.service.js:**
> Koden bruker `OPENAI_API_BASE=${config.litellm.internalUrl}` — uten `/v1` suffix.
> `LLMClient.__init__` legger til `/v1` selv: `base_url=f"{config.OPENAI_API_BASE}/v1"`.
> Dette er korrekt og skal ikke endres.
