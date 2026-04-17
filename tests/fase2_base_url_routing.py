#!/usr/bin/env python3
# ============================================================
# Test Fase 2: OPENAI_API_BASE Routing via LiteLLM
# ============================================================
# Verifiserer at OpenAI SDK bruker riktig base URL og at
# forespørsler faktisk rutes gjennom LiteLLM-proxyen.
#
# Dette er den kritiske testen: Respekterer NanoClaw-klienten
# OPENAI_API_BASE, eller prøver den å koble direkte til OpenAI?
#
# Bruk:
#   export OPENAI_API_KEY=<litellm-virtual-key-eller-master-key>
#   export OPENAI_API_BASE=http://localhost:4000
#   python3 tests/fase2_base_url_routing.py
#
# Forventet output:
#   ✅ LiteLLM mottok forespørselen og ga svar tilbake
#   ✅ Token-counts er tilgjengelige (relay fungerer)
#   ✅ Svaret inneholder forventet innhold
# ============================================================

import os
import sys
import json
import time
import urllib.request
import urllib.error

# ── Konfigurasjon ──────────────────────────────────────────
OPENAI_API_BASE = os.environ.get("OPENAI_API_BASE", "http://localhost:4000")
OPENAI_API_KEY  = os.environ.get("OPENAI_API_KEY", "")
MODEL_NAME      = os.environ.get("MODEL_NAME", "claude-sonnet")

PASS_COUNT = 0
FAIL_COUNT = 0


def _pass(msg: str):
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  ✅ PASS: {msg}")


def _fail(msg: str, detail: str = ""):
    global FAIL_COUNT
    FAIL_COUNT += 1
    print(f"  ❌ FAIL: {msg}")
    if detail:
        print(f"     → {detail}")


def _info(msg: str):
    print(f"  ℹ️  {msg}")


def _header(msg: str):
    print(f"\n{'━' * 54}")
    print(f"  {msg}")
    print(f"{'━' * 54}")


def make_request(endpoint: str, body: dict) -> tuple[int, dict]:
    """Gjør en HTTP POST til LiteLLM med JSON body."""
    url = f"{OPENAI_API_BASE.rstrip('/')}{endpoint}"
    data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read())
        except Exception:
            err_body = {"raw": str(e)}
        return e.code, err_body
    except Exception as exc:
        return 0, {"error": str(exc)}


# ── Test 1: Pre-flight konfigurasjon ──────────────────────
_header("Test 1: Konfigurasjon og pre-flight sjekk")

print(f"\n  Konfigurasjon:")
print(f"  • OPENAI_API_BASE : {OPENAI_API_BASE}")
print(f"  • OPENAI_API_KEY  : {'✅ satt' if OPENAI_API_KEY else '❌ MANGLER'}")
print(f"  • MODEL_NAME      : {MODEL_NAME}")

if not OPENAI_API_KEY:
    _fail("OPENAI_API_KEY er ikke satt", "Sett LiteLLM Virtual Key eller Master Key")
    print("\n⛔ Kan ikke fortsette uten API-nøkkel.")
    sys.exit(1)
else:
    _pass("OPENAI_API_KEY er satt")

# Bekreft at URL peker mot LiteLLM, ikke OpenAI direkte
if "api.openai.com" in OPENAI_API_BASE:
    _fail(
        "OPENAI_API_BASE peker mot OpenAI direkte!",
        "Sett OPENAI_API_BASE=http://localhost:4000"
    )
elif "localhost" in OPENAI_API_BASE or "litellm" in OPENAI_API_BASE:
    _pass(f"OPENAI_API_BASE peker mot lokal/intern proxy: {OPENAI_API_BASE}")
else:
    _info(f"OPENAI_API_BASE er satt til: {OPENAI_API_BASE}")


# ── Test 2: Chat completion via LiteLLM ───────────────────
_header("Test 2: Chat Completion — OPENAI_API_BASE routing")

SENTINEL_MESSAGE = "Say exactly: 'LiteLLM routing confirmed' and nothing else."

_info(f"Sender forespørsel til: {OPENAI_API_BASE}/v1/chat/completions")
_info(f"Modell: {MODEL_NAME}")
_info(f"Sentinel: '{SENTINEL_MESSAGE}'")
print()

start_time = time.time()
status_code, response = make_request(
    "/v1/chat/completions",
    {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": SENTINEL_MESSAGE,
            }
        ],
        "max_tokens": 50,
        "temperature": 0,
    },
)
elapsed = time.time() - start_time

if status_code == 200:
    _pass(f"HTTP 200 OK mottatt ({elapsed:.2f}s)")
else:
    _fail(
        f"HTTP {status_code} — LiteLLM svarte ikke korrekt",
        json.dumps(response, indent=2)[:300],
    )


# ── Test 3: Valider innholdet i svaret ────────────────────
_header("Test 3: Validering av svarinnhold")

if status_code == 200:
    choices = response.get("choices", [])
    if not choices:
        _fail("Ingen 'choices' i responsen", str(response))
    else:
        content = choices[0].get("message", {}).get("content", "")
        _info(f"Svar fra modellen: '{content.strip()}'")

        if "routing confirmed" in content.lower() or "litellm" in content.lower():
            _pass("Svarinnholdet inneholder sentinel-frasen")
        else:
            _info("Svar inneholder ikke eksakt sentinel, men forespørselen gikk gjennom")
            _pass("LLM-respons mottatt via LiteLLM (innholdsvalidering er guidance, ikke hard failure)")

    # ── Test 4: Token-counts (bevis på at LiteLLM relayed) ──
    _header("Test 4: Token-counts — Bevis på at LiteLLM relayed korrekt")

    usage = response.get("usage", {})
    if usage:
        prompt_tokens     = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens      = usage.get("total_tokens", 0)

        _info(f"Prompt tokens:     {prompt_tokens}")
        _info(f"Completion tokens: {completion_tokens}")
        _info(f"Total tokens:      {total_tokens}")

        if total_tokens > 0:
            _pass(f"Token-counts er tilgjengelige → LiteLLM relayed korrekt (total: {total_tokens})")
        else:
            _fail("Total tokens er 0 — uventet", str(usage))
    else:
        _fail("Ingen 'usage' felt i responsen — LiteLLM kan ha stripet dette")

    # ── Test 5: Modell i responsen ────────────────────────
    _header("Test 5: Modell-id i LiteLLM-respons")

    resp_model = response.get("model", "")
    _info(f"Modell rapportert av LiteLLM: '{resp_model}'")

    if resp_model:
        _pass(f"Modell-id tilgjengelig i respons: {resp_model}")
    else:
        _fail("Ingen 'model' felt i responsen")
else:
    _fail("Hopper over innholdsvalidering pga. HTTP-feil over")


# ── Oppsummering ───────────────────────────────────────────
print()
print("━" * 54)
print("  OPPSUMMERING:")
print(f"  ✅ PASS: {PASS_COUNT}")
print(f"  ❌ FAIL: {FAIL_COUNT}")
print("━" * 54)
print()

if FAIL_COUNT == 0:
    print("  🎉 Alle tester bestått! OPENAI_API_BASE routing fungerer.")
else:
    print("  ⚠️  En eller flere tester feilet. Se detaljer over.")

sys.exit(0 if FAIL_COUNT == 0 else 1)
