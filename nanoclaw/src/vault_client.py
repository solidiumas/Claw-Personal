# ============================================================
# NanoClaw — Vault Client (Fase 7)
# ============================================================
# HTTP-klient for å hente dekrypterte OAuth-tokens fra
# Orkestratorens Vault API.
#
# Flyten:
#   1. NanoClaw sender GET /vault/tokens med INTERNAL_TOKEN
#   2. Orkestratoren slår opp bruker-ID via token
#   3. Orkestratoren dekrypterer tokens fra PostgreSQL (The Vault)
#   4. Tokens returneres og holdes KUN i minne
#
# VIKTIG: Tokens skal ALDRI skrives til disk!
# ============================================================

import time
import httpx
from src import config

# Retry-konfigurasjon
MAX_RETRIES = 5
INITIAL_BACKOFF = 2  # sekunder


class VaultClient:
    """
    Klient for sikker kommunikasjon med Orkestratorens Vault API.

    Autentiserer med INTERNAL_TOKEN (injisert som miljøvariabel)
    og henter dekrypterte OAuth-tokens over det interne nettverket.
    """

    def __init__(self):
        self._base_url = config.ORCHESTRATOR_URL
        self._token = config.INTERNAL_TOKEN
        self._cached_tokens: dict | None = None

    def fetch_tokens(self) -> dict:
        """
        Henter dekrypterte OAuth-tokens fra The Vault.

        Inkluderer retry-logikk med eksponentiell backoff
        for å håndtere midlertidige nettverksfeil i Docker-nettverket.

        Returns:
            dict med access_token, refresh_token, expiry_date, etc.

        Raises:
            RuntimeError: Hvis alle forsøk feiler.
        """
        url = f"{self._base_url}/vault/tokens"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

        last_error = None

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                print(f"[Vault] Henter tokens fra Orkestratoren (forsøk {attempt}/{MAX_RETRIES})...")

                with httpx.Client(timeout=30.0) as client:
                    response = client.get(url, headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    tokens = data.get("tokens", data)
                    self._cached_tokens = tokens

                    print(f"[Vault] ✅ Tokens hentet!")
                    print(f"[Vault]   Access token:  {'✅' if tokens.get('access_token') else '❌'}")
                    print(f"[Vault]   Refresh token: {'✅' if tokens.get('refresh_token') else '❌'}")

                    return tokens

                elif response.status_code == 401:
                    raise RuntimeError(
                        "Vault-autentisering feilet (401). "
                        "INTERNAL_TOKEN er ugyldig eller utløpt."
                    )

                elif response.status_code == 404:
                    raise RuntimeError(
                        "Ingen tokens funnet i Vault (404). "
                        "Brukeren har kanskje ikke fullført OAuth ennå."
                    )

                else:
                    last_error = f"HTTP {response.status_code}: {response.text}"
                    print(f"[Vault] ⚠️  Uventet respons: {last_error}")

            except httpx.ConnectError as e:
                last_error = f"Tilkoblingsfeil: {e}"
                print(f"[Vault] ⚠️  Kan ikke nå Orkestratoren: {last_error}")

            except RuntimeError:
                # Ikke retry på autentiseringsfeil eller manglende tokens
                raise

            except Exception as e:
                last_error = str(e)
                print(f"[Vault] ⚠️  Feil: {last_error}")

            # Eksponentiell backoff
            if attempt < MAX_RETRIES:
                wait = INITIAL_BACKOFF * (2 ** (attempt - 1))
                print(f"[Vault] Venter {wait}s før neste forsøk...")
                time.sleep(wait)

        raise RuntimeError(
            f"Kunne ikke hente tokens etter {MAX_RETRIES} forsøk. "
            f"Siste feil: {last_error}"
        )

    def refresh_access_token(self) -> dict:
        """
        Ber Orkestratoren om å fornye access_token via refresh_token.

        Brukes når access_token er utløpt under agentens kjøring.

        Returns:
            dict med oppdaterte tokens.

        Raises:
            RuntimeError: Hvis fornyelse feiler.
        """
        url = f"{self._base_url}/vault/tokens/refresh"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

        print("[Vault] Ber om fornyelse av access_token...")

        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers)

        if response.status_code == 200:
            data = response.json()
            tokens = data.get("tokens", data)
            self._cached_tokens = tokens
            print("[Vault] ✅ Access token fornyet!")
            return tokens

        raise RuntimeError(
            f"Token-fornyelse feilet: HTTP {response.status_code} — {response.text}"
        )

    @property
    def tokens(self) -> dict | None:
        """Returnerer cached tokens (kun i minne)."""
        return self._cached_tokens
