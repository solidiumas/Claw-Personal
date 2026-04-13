# ============================================================
# NanoClaw — Tools Package (Fase 7)
# ============================================================
# Verktøy for AI-agenten. Hver modul eksponerer:
#   - En liste med tool_definitions (OpenAI function format)
#   - En execute(name, args, tokens) funksjon
#
# Tilgjengelige verktøy:
#   - gmail:    Les innboks, søk, hent e-post-detaljer
#   - calendar: Les kommende hendelser
# ============================================================

from src.tools.gmail import (
    TOOL_DEFINITIONS as GMAIL_TOOLS,
    execute as execute_gmail,
)
from src.tools.calendar import (
    TOOL_DEFINITIONS as CALENDAR_TOOLS,
    execute as execute_calendar,
)

# Samlet liste med alle verktøydefinisjoner
ALL_TOOL_DEFINITIONS = GMAIL_TOOLS + CALENDAR_TOOLS

# Register: tool_name → executor function
_EXECUTORS = {}

for _tool in GMAIL_TOOLS:
    _EXECUTORS[_tool["function"]["name"]] = execute_gmail

for _tool in CALENDAR_TOOLS:
    _EXECUTORS[_tool["function"]["name"]] = execute_calendar


def execute_tool(tool_name: str, arguments: dict, tokens: dict) -> str:
    """
    Kjører et verktøy og returnerer resultatet som en streng.

    Args:
        tool_name:  Navnet på verktøyet (fra tool_calls)
        arguments:  Argumenter fra LLM-en
        tokens:     Dekrypterte OAuth-tokens (in-memory)

    Returns:
        Resultat som tekst-streng.

    Raises:
        ValueError: Hvis verktøyet ikke finnes.
    """
    executor = _EXECUTORS.get(tool_name)
    if not executor:
        raise ValueError(f"Ukjent verktøy: {tool_name}")

    return executor(tool_name, arguments, tokens)
