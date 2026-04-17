#!/usr/bin/env bash
# ============================================================
# Claw Personal — Master Test Runner
# ============================================================
# Kjører alle 4 testfaser i sekvens og gir en samlet rapport.
#
# Bruk:
#   # Kopier .env og fyll inn verdier, deretter:
#   source .env && bash tests/run_all_tests.sh
#
#   # Eller med eksplisitte variabler:
#   ANTHROPIC_API_KEY=sk-ant-...  \
#   LITELLM_MASTER_KEY=sk-litellm-... \
#   OPENAI_API_KEY=sk-litellm-...     \
#   bash tests/run_all_tests.sh
#
# Env-variabler som brukes:
#   ANTHROPIC_API_KEY   – Ekte Anthropic nøkkel (kun av LiteLLM)
#   LITELLM_MASTER_KEY  – LiteLLM admin-nøkkel
#   OPENAI_API_KEY      – LiteLLM Virtual Key (for NanoClaw-containere)
#   LITELLM_URL         – LiteLLM base URL (default: http://localhost:4000)
#   MODEL_NAME          – Modell alias (default: claude-sonnet)
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
START_TIME=$(date +%s)

# Resultatliste
declare -a FASE_RESULTS=()
TOTAL_PASS=0
TOTAL_FAIL=0

# ── Utility ────────────────────────────────────────────────
print_banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║                                                          ║"
  echo "║   Claw Personal — ANTHROPIC_BASE_URL Test Suite         ║"
  echo "║   NanoClaw ← OpenAI SDK → LiteLLM ← Anthropic API      ║"
  echo "║                                                          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Tidspunkt:     $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  LiteLLM URL:   $LITELLM_URL"
  echo "  Modell:        ${MODEL_NAME:-claude-sonnet}"
  echo "  Prosjekt-root: $PROJECT_ROOT"
  echo ""
}

run_fase() {
  local fase_num="$1"
  local fase_name="$2"
  local fase_script="$3"

  echo ""
  echo "┌──────────────────────────────────────────────────────────┐"
  printf "│  %-56s│\n" "Fase $fase_num: $fase_name"
  echo "└──────────────────────────────────────────────────────────┘"

  local fase_start=$(date +%s)

  if [[ "$fase_script" == *.py ]]; then
    python3 "$SCRIPT_DIR/$fase_script" 2>&1
    local exit_code=$?
  else
    bash "$SCRIPT_DIR/$fase_script" 2>&1
    local exit_code=$?
  fi

  local fase_end=$(date +%s)
  local elapsed=$((fase_end - fase_start))

  if [[ $exit_code -eq 0 ]]; then
    FASE_RESULTS+=("✅ Fase $fase_num ($fase_name) — BESTÅTT [${elapsed}s]")
    ((TOTAL_PASS++))
  else
    FASE_RESULTS+=("❌ Fase $fase_num ($fase_name) — FEILET [${elapsed}s]")
    ((TOTAL_FAIL++))
  fi

  return $exit_code
}

# ── Validering av environment ──────────────────────────────
validate_env() {
  echo "─── Pre-flight: Environment validering ─────────────────────"
  local issues=0

  [[ -z "${ANTHROPIC_API_KEY:-}" ]] && echo "  ⚠️  ANTHROPIC_API_KEY ikke satt (LiteLLM trenger denne)" && ((issues++))
  [[ -z "${LITELLM_MASTER_KEY:-}" ]] && echo "  ⚠️  LITELLM_MASTER_KEY ikke satt" && ((issues++))
  [[ -z "${OPENAI_API_KEY:-}" ]]  && echo "  ⚠️  OPENAI_API_KEY ikke satt (LiteLLM Virtual Key)" && ((issues++))

  if [[ $issues -gt 0 ]]; then
    echo ""
    echo "  Tip: Kjør 'source .env' fra prosjekt-roten (${PROJECT_ROOT}/.env)"
    echo "  Deretter: bash tests/run_all_tests.sh"
    echo ""
    if [[ "${FORCE:-}" != "1" ]]; then
      echo "  Sett FORCE=1 for å kjøre likevel."
      exit 1
    else
      echo "  FORCE=1 satt — fortsetter likevel..."
    fi
  else
    echo "  ✅ Alle nødvendige env-variabler er satt"
  fi
  echo ""
}

# ── Parse flagg ────────────────────────────────────────────
ONLY_FASE=""
SKIP_FASE4=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fase)      ONLY_FASE="$2"; shift 2 ;;
    --skip-fase4) SKIP_FASE4=1; shift ;;
    --help|-h)
      echo "Bruk: bash tests/run_all_tests.sh [--fase <1-4>] [--skip-fase4]"
      echo ""
      echo "  --fase <N>       Kjør kun fase N (1, 2, 3 eller 4)"
      echo "  --skip-fase4     Hopp over Fase 4 (agent container spawn)"
      echo ""
      exit 0
      ;;
    *) echo "Ukjent flagg: $1"; exit 1 ;;
  esac
done

# ── Hovedkjøring ───────────────────────────────────────────
print_banner
validate_env

OVERALL_FAIL=0

run_fase_safe() {
  run_fase "$@" || { ((OVERALL_FAIL++)); return 0; }
}

if [[ -z "$ONLY_FASE" || "$ONLY_FASE" == "1" ]]; then
  run_fase_safe "1" "LiteLLM Helse & Modell-verifisering" "fase1_litellm_health.sh"
fi

if [[ -z "$ONLY_FASE" || "$ONLY_FASE" == "2" ]]; then
  run_fase_safe "2" "OPENAI_API_BASE Routing via LiteLLM" "fase2_base_url_routing.py"
fi

if [[ -z "$ONLY_FASE" || "$ONLY_FASE" == "3" ]]; then
  run_fase_safe "3" "Avansert validering — LiteLLM Logger" "fase3_litellm_logging.sh"
fi

if [[ (-z "$ONLY_FASE" || "$ONLY_FASE" == "4") && $SKIP_FASE4 -eq 0 ]]; then
  run_fase_safe "4" "Agent Container Spawn & Isolasjon" "fase4_agent_container_spawn.sh"
elif [[ $SKIP_FASE4 -eq 1 ]]; then
  echo ""
  echo "  ⏭️  Fase 4 hoppet over (--skip-fase4)"
fi

if [[ -z "$ONLY_FASE" || "$ONLY_FASE" == "5" ]]; then
  run_fase_safe "5" "Claude Agent SDK / ANTHROPIC_BASE_URL" "fase5_anthropic_sdk_routing.py"
fi

# ── Sluttrapport ───────────────────────────────────────────
END_TIME=$(date +%s)
TOTAL_ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                      SLUTTRAPPORT                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  %-56s║\n" "  Kjøretid: ${TOTAL_ELAPSED}s"
echo "║                                                          ║"

for result in "${FASE_RESULTS[@]}"; do
  printf "║  %-56s║\n" "$result"
done

echo "║                                                          ║"
printf "║  %-56s║\n" "  Faser bestått: $TOTAL_PASS / $((TOTAL_PASS + TOTAL_FAIL))"
echo "╠══════════════════════════════════════════════════════════╣"

if [[ $OVERALL_FAIL -eq 0 ]]; then
  echo "║  🎉 ALLE TESTER BESTÅTT                                  ║"
  echo "║                                                          ║"
  echo "║  NanoClaw-agenten ruter ALL LLM-trafikk via LiteLLM.    ║"
  echo "║  Anthropic API-nøkkelen er aldri eksponert til           ║"
  echo "║  brukercontainere. Arkitekturen er verifisert. ✅        ║"
else
  echo "║  ⚠️  $OVERALL_FAIL FASE(R) FEILET                                 ║"
  echo "║  Se output over for detaljer.                            ║"
fi

echo "╚══════════════════════════════════════════════════════════╝"
echo ""

exit $OVERALL_FAIL
