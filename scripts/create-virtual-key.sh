#!/usr/bin/env bash
# ============================================================
# create-virtual-key.sh
# ============================================================
# Oppretter en Virtual Key i LiteLLM for en ny brukercontainer.
#
# Denne Virtual Key-en:
#   - Identifiserer brukeren (user_id)
#   - Begrenser tilgang til bestemte modeller (claude-sonnet, claude-haiku)
#   - Setter et budsjett per bruker (for kostnadskontroll)
#
# Bruk:
#   export LITELLM_MASTER_KEY="sk-clawpersonal-..."
#   ./scripts/create-virtual-key.sh <bruker-id>
#
# Eksempel:
#   ./scripts/create-virtual-key.sh user-001
# ============================================================

set -euo pipefail

USER_ID="${1:?Feil: Mangler bruker-id. Bruk: $0 <bruker-id>}"
LITELLM_HOST="${LITELLM_HOST:-http://localhost:4000}"
MASTER_KEY="${LITELLM_MASTER_KEY:?Feil: Miljøvariabelen LITELLM_MASTER_KEY er ikke satt.}"

echo "==> Oppretter Virtual Key for bruker: ${USER_ID}"
echo "    LiteLLM host: ${LITELLM_HOST}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${LITELLM_HOST}/key/generate" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"${USER_ID}\",
    \"max_budget\": 10,
    \"budget_duration\": \"30d\",
    \"models\": [\"claude-sonnet\", \"claude-haiku\"],
    \"metadata\": {
      \"user_id\": \"${USER_ID}\",
      \"created_by\": \"orchestrator\",
      \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }")

# Hent HTTP-statuskode fra siste linje
HTTP_CODE=$(echo "${RESPONSE}" | tail -n1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" -ge 200 && "${HTTP_CODE}" -lt 300 ]]; then
  echo "==> Suksess! Virtual Key opprettet."
  echo ""
  echo "${BODY}" | python3 -m json.tool 2>/dev/null || echo "${BODY}"
else
  echo "==> Feil! HTTP ${HTTP_CODE}"
  echo "${BODY}"
  exit 1
fi
