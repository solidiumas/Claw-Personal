# ============================================================
# NanoClaw — LLM Client (Fase 7)
# ============================================================
# OpenAI-kompatibel klient som snakker med LiteLLM proxy.
#
# LiteLLM oversetter alle forespørsler til den konfigurerte
# modellen (Claude/Gemini) transparent. NanoClaw «tror» den
# snakker med OpenAI, men trafikken rutes til LiteLLM i
# claw-internal-nettverket.
#
# Konfigurasjon:
#   OPENAI_API_BASE → http://litellm-proxy:4000
#   OPENAI_API_KEY  → LiteLLM Virtual Key (per-bruker budsjett)
#   MODEL_NAME      → claude-sonnet (default)
# ============================================================

import json
from openai import OpenAI
from src import config


class LLMClient:
    """
    LLM-klient for NanoClaw AI-agenten.

    Bruker OpenAI SDK mot LiteLLM proxy for modell-agnostisk
    kommunikasjon. Støtter tool-calling for agent-loopen.
    """

    def __init__(self):
        self._client = OpenAI(
            api_key=config.OPENAI_API_KEY,
            base_url=f"{config.OPENAI_API_BASE}/v1",
            timeout=config.LLM_TIMEOUT,
        )
        self._model = config.MODEL_NAME

        print(f"[LLM] Klient initialisert")
        print(f"[LLM]   Base URL: {config.OPENAI_API_BASE}")
        print(f"[LLM]   Modell:   {self._model}")

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.3,
    ) -> dict:
        """
        Sender en chat completion-forespørsel til LLM via LiteLLM.

        Args:
            messages:    Liste med meldinger (system, user, assistant, tool)
            tools:       Liste med verktøydefinisjoner (OpenAI function calling format)
            temperature: Kreativitet (0.0 = deterministisk, 1.0 = kreativ)

        Returns:
            dict med:
                - content:    Tekstlig svar fra modellen (str | None)
                - tool_calls: Liste med verktøykall (list | None)
                - usage:      Token-bruk { prompt, completion, total }
        """
        kwargs = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
        }

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_call_choice"] = "auto"

        response = self._client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        message = choice.message

        result = {
            "content": message.content,
            "tool_calls": None,
            "usage": {
                "prompt": response.usage.prompt_tokens,
                "completion": response.usage.completion_tokens,
                "total": response.usage.total_tokens,
            },
        }

        # Parse tool calls hvis modellen ba om verktøybruk
        if message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "function": tc.function.name,
                    "arguments": json.loads(tc.function.arguments),
                }
                for tc in message.tool_calls
            ]

        return result

    @property
    def model(self) -> str:
        """Returnerer navnet på den aktive modellen."""
        return self._model
