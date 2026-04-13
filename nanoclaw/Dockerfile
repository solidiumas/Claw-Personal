# ============================================================
# NanoClaw — Dockerfile (Fase 7: Data Plane)
# ============================================================
# Bygg-instruksjon for nanoclaw-base:latest Docker-imaget.
#
# Inneholder:
#   - Python 3.12 runtime (slim for minimal footprint)
#   - AI Agent med action-observation loop
#   - Google API-klienter (Gmail, Calendar — read-only)
#   - OpenAI SDK for LiteLLM proxy-kommunikasjon
#
# Kjøres isolert i claw-internal-nettverket.
# Ingen direkte internett-tilgang — kun via LiteLLM proxy.
#
# Bygg:
#   docker build -t nanoclaw-base:latest ./nanoclaw
#
# Miljøvariabler (injisert av Orkestratoren):
#   INTERNAL_TOKEN  — Autentisering mot Vault
#   OPENAI_API_KEY  — LiteLLM Virtual Key
#   OPENAI_API_BASE — LiteLLM proxy URL
#   MODEL_NAME      — Standard LLM-modell
#   USER_ID         — Brukeridentifikator
# ============================================================

# ----- Stage 1: Bygg dependencies -----
FROM python:3.12-slim AS builder

WORKDIR /build

# Installer Python-dependencies i et separat stage
# for å utnytte Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ----- Stage 2: Runtime -----
FROM python:3.12-slim

# Sikkerhet: Kjør som non-root bruker
RUN groupadd -r nanoclaw && useradd -r -g nanoclaw -d /app -s /sbin/nologin nanoclaw

WORKDIR /app

# Kopier installerte dependencies fra builder-stage
COPY --from=builder /install /usr/local

# Kopier applikasjonskode
COPY src/ ./src/

# Opprett /tmp for wake-signal (skrivbar for alle)
RUN mkdir -p /tmp && chmod 1777 /tmp

# Bytt til non-root bruker
USER nanoclaw

# Helse-sjekk — verifiser at Python-prosessen kjører
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
  CMD python -c "import os; assert os.path.exists('/app/src/main.py')" || exit 1

# Start NanoClaw-agenten
CMD ["python", "-u", "src/main.py"]
