# ============================================================
# NanoClaw — Agent Loop (Fase 7)
# ============================================================
# Kjernen i NanoClaw: Action-Observation agent-loopen.
#
# Arkitektur:
#   1. System prompt definerer agentens persona og regler
#   2. LLM mottar meldingshistorikk + verktøy
#   3. LLM enten svarer direkte eller velger verktøy
#   4. Verktøy utføres → resultat legges til som «observation»
#   5. Loop gjentas til LLM svarer uten verktøykall
#
# Sikkerhetsmekanismer:
#   - MAX_ITERATIONS forhindrer uendelige loops
#   - Alle verktøy er read-only (ingen skrivetilgang)
#   - Token-bruk logges for kostnadskontroll
# ============================================================

import json
import traceback
from src import config
from src.llm_client import LLMClient
from src.tools import ALL_TOOL_DEFINITIONS, execute_tool

# -----------------------------------------------------------
# System Prompt
# -----------------------------------------------------------

SYSTEM_PROMPT = """Du er NanoClaw — en intelligent, personlig AI-assistent bygget for YouTube-innholdsprodusenter.

## Dine kapabiliteter
Du har tilgang til brukerens Google-konto (read-only) via følgende verktøy:
- **Gmail**: Lese innboks, søke etter e-poster, og hente fullstendige e-poster
- **Google Calendar**: Vise kommende hendelser og hente detaljer om spesifikke hendelser

## Dine regler
1. Du har KUN lesetilgang. Du kan ALDRI sende, slette eller endre noe.
2. Vær proaktiv — foreslå handlinger brukeren kanskje ikke tenkte på.
3. Vær konsis men grundig. Gi klare sammendrag.
4. Respekter personvern — aldri del sensitiv informasjon unødvendig.
5. Bruk verktøyene aktivt for å gi konkrete, oppdaterte svar.
6. Når du presenterer e-poster eller hendelser, organiser dem logisk.

## Ditt oppdrag
Analysér innboksen og kalenderen for å gi brukeren:
- Oversikt over viktige e-poster som trenger oppmerksomhet
- Kommende hendelser og deadlines
- Forslag til prioritering av oppgaver

Start med å hente de siste e-postene og kommende kalenderhendelser for å gi brukeren en oppdatering."""


class AgentLoop:
    """
    Action-Observation loop for NanoClaw AI-agenten.

    Kjører en iterativ loop der LLM-en velger verktøy,
    observerer resultater, og bygger opp en komplett analyse
    for brukeren.
    """

    def __init__(self, llm_client: LLMClient, tokens: dict):
        """
        Args:
            llm_client: Initialisert LLM-klient (mot LiteLLM)
            tokens:     Dekrypterte OAuth-tokens (in-memory)
        """
        self._llm = llm_client
        self._tokens = tokens
        self._max_iterations = config.MAX_AGENT_ITERATIONS
        self._total_tokens_used = 0

    def run(self, user_message: str | None = None) -> str:
        """
        Kjører agent-loopen.

        Args:
            user_message: Valgfri brukermelding. Hvis None,
                         brukes system prompt alene (initialisering).

        Returns:
            Agentens endelige tekstsvar.
        """
        # Bygg initial meldingshistorikk
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        if user_message:
            messages.append({"role": "user", "content": user_message})
        else:
            # Initialiseringsmode — be agenten starte analyse
            messages.append({
                "role": "user",
                "content": (
                    "Start en komplett analyse av innboksen min og kalenderen. "
                    "Gi meg en oppdatering på hva som er viktig akkurat nå."
                ),
            })

        print(f"\n{'=' * 60}")
        print(f"[Agent] Starter agent-loop (maks {self._max_iterations} iterasjoner)")
        print(f"[Agent] Modell: {self._llm.model}")
        print(f"[Agent] Verktøy: {len(ALL_TOOL_DEFINITIONS)} tilgjengelig")
        print(f"{'=' * 60}")

        for iteration in range(1, self._max_iterations + 1):
            print(f"\n[Agent] --- Iterasjon {iteration}/{self._max_iterations} ---")

            # Kall LLM med verktøydefinisjoner
            try:
                response = self._llm.chat(
                    messages=messages,
                    tools=ALL_TOOL_DEFINITIONS,
                )
            except Exception as e:
                print(f"[Agent] ❌ LLM-kall feilet: {e}")
                return f"Beklager, en feil oppstod under analysen: {e}"

            # Logg token-bruk
            usage = response.get("usage", {})
            self._total_tokens_used += usage.get("total", 0)
            print(f"[Agent] Tokens brukt: {usage.get('total', 0)} "
                  f"(totalt: {self._total_tokens_used})")

            # Sjekk om modellen svarer direkte (ingen verktøykall)
            if not response.get("tool_calls"):
                final_answer = response.get("content", "")
                print(f"\n[Agent] ✅ Agenten ga et endelig svar")
                print(f"[Agent] Totale tokens brukt: {self._total_tokens_used}")
                return final_answer

            # Legg til assistentens melding med tool_calls
            assistant_message = {"role": "assistant", "content": response.get("content")}

            # Konverter tool_calls tilbake til OpenAI-format for meldingshistorikk
            assistant_message["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["function"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in response["tool_calls"]
            ]
            messages.append(assistant_message)

            # Utfør hvert verktøykall
            for tool_call in response["tool_calls"]:
                tool_name = tool_call["function"]
                tool_args = tool_call["arguments"]
                tool_id = tool_call["id"]

                print(f"[Agent] 🔧 Verktøy: {tool_name}")
                print(f"[Agent]    Args: {json.dumps(tool_args, ensure_ascii=False)}")

                try:
                    result = execute_tool(tool_name, tool_args, self._tokens)
                    print(f"[Agent]    ✅ Resultat: {len(result)} tegn")
                except Exception as e:
                    result = f"Feil ved utførelse av {tool_name}: {str(e)}"
                    print(f"[Agent]    ❌ Feil: {e}")
                    traceback.print_exc()

                # Legg til observasjon (tool result) i meldingshistorikk
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_id,
                    "content": result,
                })

        # Maks iterasjoner nådd
        print(f"\n[Agent] ⚠️  Maks iterasjoner ({self._max_iterations}) nådd!")
        return (
            "Analysen er komplett, men jeg nådde grensen for antall operasjoner. "
            "Her er det jeg har funnet så langt basert på verktøyene jeg brukte."
        )
