#!/usr/bin/env bash
# ============================================================
# Test Fase 1: LiteLLM Helse & Modell-verifisering
# ============================================================
# Verifiserer at LiteLLM-proxyen er oppe og tilgjengelig,
# og at de konfigurerte modellene (claude-sonnet, claude-haiku)
# er registrert og klare.
#
# Bruk: bash tests/fase1_litellm_health.sh
# Env: LITELLM_URL (default: http://localhost:4000)
#      LITELLM_MASTER_KEY (fra .env)
# ============================================================

set -euo pipefail

LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-}"

PASS=0
FAIL=0

_pass() { echo "  ✅ PASS: $1"; ((PASS++)); }
_fail() { echo "  ❌ FAIL: $1"; ((FAIL++)); }
_info() { echo "  ℹ️  $1"; }
_header() { echo ""; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; echo "  $1"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Claw Personal — Test Fase 1: LiteLLM Helse        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  LiteLLM URL: $LITELLM_URL"
echo ""

# ── Test 1: /health endepunkt ─────────────────────────────
_header "Test 1: /health endepunkt"

HTTP_CODE=$(curl -s -o /tmp/litellm_health.json -w "%{http_code}" \
  "${LITELLM_URL}/health" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  _pass "/health returnerte 200 OK"
  _info "Respons: $(cat /tmp/litellm_health.json | head -c 200)"
else
  _fail "/health returnerte HTTP $HTTP_CODE (forventet 200)"
  _info "Tip: Er LiteLLM oppe? Prøv: docker compose up -d litellm-proxy"
fi

# ── Test 2: /v1/models endepunkt ──────────────────────────
_header "Test 2: /v1/models — Modell-liste"

AUTH_HEADER=""
if [[ -n "$LITELLM_MASTER_KEY" ]]; then
  AUTH_HEADER="-H 'Authorization: Bearer ${LITELLM_MASTER_KEY}'"
fi

HTTP_CODE=$(curl -s \
  -o /tmp/litellm_models.json \
  -w "%{http_code}" \
  ${AUTH_HEADER:+"-H" "Authorization: Bearer ${LITELLM_MASTER_KEY}"} \
  "${LITELLM_URL}/v1/models" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  _pass "/v1/models returnerte 200 OK"

  # Sjekk at claude-sonnet er tilgjengelig
  if cat /tmp/litellm_models.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
models = [m['id'] for m in data.get('data', [])]
print('Tilgjengelige modeller:', models)
assert 'claude-sonnet' in models, 'claude-sonnet IKKE funnet!'
print('claude-sonnet: FUNNET')
assert 'claude-haiku' in models, 'claude-haiku IKKE funnet!'
print('claude-haiku: FUNNET')
" 2>&1; then
    _pass "Begge modeller (claude-sonnet, claude-haiku) er registrert"
  else
    _fail "En eller begge modeller mangler i /v1/models"
  fi
else
  _fail "/v1/models returnerte HTTP $HTTP_CODE"
fi

# ── Test 3: Nettverkstilgjengelighet fra docker-nettverk ──
_header "Test 3: Intern Docker-nettverkstilgjengelighet"

if docker network inspect claw-internal &>/dev/null; then
  _pass "Docker-nettverk 'claw-internal' eksisterer"

  # Sjekk at litellm-proxy er koblet til nettverket
  CONTAINERS=$(docker network inspect claw-internal \
    --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")

  if echo "$CONTAINERS" | grep -q "litellm-proxy"; then
    _pass "litellm-proxy er koblet til claw-internal nettverket"
  else
    _fail "litellm-proxy er IKKE koblet til claw-internal"
    _info "Kjørende containere i nettverket: $CONTAINERS"
  fi
else
  _fail "Docker-nettverk 'claw-internal' eksisterer ikke"
  _info "Kjør: docker compose up -d"
fi

# ── Oppsummering ───────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  OPPSUMMERING:"
echo "  ✅ PASS: $PASS"
echo "  ❌ FAIL: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
