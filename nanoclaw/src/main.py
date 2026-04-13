# ============================================================
# NanoClaw — Main Entry Point (Fase 7)
# ============================================================
# Oppstarts-skript for NanoClaw AI-agenten.
#
# Flyten:
#   1. Container starter i «standby»-modus
#   2. Overvåker /tmp/wake.signal (skrevet av Orkestratoren)
#   3. Når signal mottas: Hent dekrypterte tokens fra Vault
#   4. Initialiser LLM-klient og verktøy
#   5. Kjør agent-loopen (action-observation)
#   6. Logg resultater og gå tilbake til standby
#
# Orkestratoren sender wake-signal via:
#   docker exec <container> sh -c 'echo "OAUTH_TOKENS_READY" > /tmp/wake.signal'
#
# Containeren kan også starte direkte hvis tokens allerede er
# tilgjengelige (f.eks. ved restart av en eksisterende container).
# ============================================================

import os
import sys
import time
import traceback

from src import config
from src.vault_client import VaultClient
from src.llm_client import LLMClient
from src.agent.loop import AgentLoop


def print_banner():
    """Skriver ut NanoClaw oppstarts-banner."""
    print("")
    print("=" * 60)
    print("  _   _                    ____ _")
    print(" | \\ | | __ _ _ __   ___  / ___| | __ ___      __")
    print(" |  \\| |/ _` | '_ \\ / _ \\| |   | |/ _` \\ \\ /\\ / /")
    print(" | |\\  | (_| | | | | (_) | |___| | (_| |\\ V  V /")
    print(" |_| \\_|\\__,_|_| |_|\\___/ \\____|_|\\__,_| \\_/\\_/")
    print("")
    print("  Claw Personal — AI Agent v0.1.0 (Fase 7)")
    print("=" * 60)
    print(f"  Bruker-ID:  {config.USER_ID}")
    print(f"  Modell:     {config.MODEL_NAME}")
    print(f"  LLM Proxy:  {config.OPENAI_API_BASE}")
    print(f"  Orkestrator: {config.ORCHESTRATOR_URL}")
    print("=" * 60)
    print("")


def wait_for_wake_signal():
    """
    Venter på wake-signal fra Orkestratoren.

    Orkestratoren sender signalet via docker exec:
      echo "OAUTH_TOKENS_READY" > /tmp/wake.signal

    Returnerer True når signal mottas, eller umiddelbart
    hvis signalet allerede finnes (container restart).
    """
    signal_path = config.WAKE_SIGNAL_PATH

    # Sjekk om signal allerede finnes (container restart)
    if os.path.exists(signal_path):
        print("[Main] Wake-signal funnet ved oppstart (mulig restart)")
        _consume_signal(signal_path)
        return True

    print("[Main] Venter på wake-signal fra Orkestratoren...")
    print(f"[Main]   Signal-fil: {signal_path}")
    print(f"[Main]   Sjekker hvert {config.WAKE_CHECK_INTERVAL}. sekund")
    print("")

    while True:
        if os.path.exists(signal_path):
            print("[Main] 🔔 Wake-signal mottatt!")
            _consume_signal(signal_path)
            return True

        time.sleep(config.WAKE_CHECK_INTERVAL)


def _consume_signal(path: str):
    """Leser og sletter wake-signal-filen."""
    try:
        with open(path, "r") as f:
            content = f.read().strip()
        print(f"[Main]   Signal innhold: {content}")
        os.remove(path)
    except Exception:
        pass


def initialize_and_run():
    """
    Hovedflyten etter wake-signal:
      1. Hent tokens fra Vault
      2. Initialiser LLM-klient
      3. Kjør agent-loopen
    """
    # ----- 1. Hent tokens fra The Vault -----
    print("\n[Main] Fase 1: Henter tokens fra The Vault...")
    vault = VaultClient()

    try:
        tokens = vault.fetch_tokens()
    except RuntimeError as e:
        print(f"[Main] ❌ Vault-feil: {e}")
        print("[Main] Går tilbake til standby...")
        return False

    # Verifiser at vi har nødvendige tokens
    if not tokens.get("access_token"):
        print("[Main] ❌ Ingen access_token i Vault-respons!")
        return False

    print("[Main] ✅ Tokens hentet og lastet i minne")

    # ----- 2. Initialiser LLM-klient -----
    print("\n[Main] Fase 2: Initialiserer LLM-klient...")

    try:
        llm = LLMClient()
    except Exception as e:
        print(f"[Main] ❌ LLM-initialisering feilet: {e}")
        return False

    print("[Main] ✅ LLM-klient klar")

    # ----- 3. Kjør agent-loopen -----
    print("\n[Main] Fase 3: Starter agent-loop (initial analyse)...")

    try:
        agent = AgentLoop(llm_client=llm, tokens=tokens)
        result = agent.run()

        print(f"\n{'=' * 60}")
        print("[Main] 📊 Agent-analyse fullført!")
        print(f"{'=' * 60}")
        print(result)
        print(f"{'=' * 60}\n")

    except Exception as e:
        print(f"[Main] ❌ Agent-loop feilet: {e}")
        traceback.print_exc()
        return False

    return True


def main():
    """
    NanoClaw hovedprosess.

    Kjører i en evig loop:
      1. Vent på wake-signal
      2. Kjør agent
      3. Gå tilbake til standby
    """
    print_banner()

    # Valider konfigurasjon
    if not config.INTERNAL_TOKEN:
        print("[Main] ⚠️  INTERNAL_TOKEN er ikke satt!")
        print("[Main] Containeren kan ikke autentisere mot Vault.")

    if not config.OPENAI_API_KEY:
        print("[Main] ⚠️  OPENAI_API_KEY er ikke satt!")
        print("[Main] Containeren kan ikke nå LLM proxy.")

    # Hovedloop — vent på signaler og kjør agent
    while True:
        try:
            # Steg 1: Vent på wake-signal
            wait_for_wake_signal()

            # Steg 2: Initialiser og kjør
            success = initialize_and_run()

            if success:
                print("\n[Main] ✅ Kjøring fullført. Går tilbake til standby.\n")
            else:
                print("\n[Main] ⚠️  Kjøring mislyktes. Prøver igjen ved neste signal.\n")

        except KeyboardInterrupt:
            print("\n[Main] Mottok avslutningssignal. Avslutter...")
            sys.exit(0)

        except Exception as e:
            print(f"\n[Main] ❌ Uventet feil: {e}")
            traceback.print_exc()
            print("[Main] Venter 10 sekunder før neste forsøk...")
            time.sleep(10)


if __name__ == "__main__":
    main()
