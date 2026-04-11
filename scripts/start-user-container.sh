#!/usr/bin/env bash
# ============================================================
# start-user-container.sh
# ============================================================
# Spinner opp en isolert NanoClaw-container for en bruker.
#
# Containeren:
#   - Kobles til det lukkede "claw-internal"-nettverket
#   - Kan KUN nå litellm-proxy:4000 (ingen direkte internett)
#   - Mottar en Virtual Key for autentisering mot LiteLLM
#   - Kjører NanoClaw-motoren i isolasjon
#
# Bruk:
#   ./scripts/start-user-container.sh <bruker-id> <virtual-key>
#
# Eksempel:
#   ./scripts/start-user-container.sh user-001 sk-xxxxxxxxxxxxx
# ============================================================

set -euo pipefail

USER_ID="${1:?Feil: Mangler bruker-id. Bruk: $0 <bruker-id> <virtual-key>}"
VIRTUAL_KEY="${2:?Feil: Mangler virtual key. Bruk: $0 <bruker-id> <virtual-key>}"

CONTAINER_NAME="claw-user-${USER_ID}"
NANOCLAW_IMAGE="${NANOCLAW_IMAGE:-nanoclaw:latest}"
NETWORK_NAME="${CLAW_NETWORK:-claw-internal}"
LITELLM_BASE_URL="${LITELLM_BASE_URL:-http://litellm-proxy:4000}"
MODEL_NAME="${MODEL_NAME:-claude-sonnet}"

echo "==> Starter NanoClaw-container for bruker: ${USER_ID}"
echo "    Container: ${CONTAINER_NAME}"
echo "    Image:     ${NANOCLAW_IMAGE}"
echo "    Nettverk:  ${NETWORK_NAME}"
echo "    LLM Base:  ${LITELLM_BASE_URL}"
echo "    Modell:    ${MODEL_NAME}"
echo ""

# Sjekk om containeren allerede kjører
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> Advarsel: Container '${CONTAINER_NAME}' eksisterer allerede."
  echo "    Stopper og fjerner eksisterende container..."
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}" 2>/dev/null || true
fi

# Start containeren
docker run -d \
  --name "${CONTAINER_NAME}" \
  --network "${NETWORK_NAME}" \
  --restart unless-stopped \
  --memory 512m \
  --cpus 0.5 \
  -e OPENAI_API_KEY="${VIRTUAL_KEY}" \
  -e OPENAI_API_BASE="${LITELLM_BASE_URL}" \
  -e MODEL_NAME="${MODEL_NAME}" \
  -e USER_ID="${USER_ID}" \
  "${NANOCLAW_IMAGE}"

echo ""
echo "==> Container '${CONTAINER_NAME}' startet!"
echo "    Status: $(docker inspect -f '{{.State.Status}}' "${CONTAINER_NAME}")"
echo ""
echo "    Vis logger:  docker logs -f ${CONTAINER_NAME}"
echo "    Stopp:       docker stop ${CONTAINER_NAME}"
echo "    Fjern:       docker rm ${CONTAINER_NAME}"
