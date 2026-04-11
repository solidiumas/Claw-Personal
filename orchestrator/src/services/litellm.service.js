// ============================================================
// Claw Personal — LiteLLM Service
// ============================================================
// HTTP-klient for kommunikasjon med LiteLLM proxy.
//
// Orkestratoren bruker LiteLLM sitt admin-API til å opprette
// Virtual Keys for nye brukercontainere. Virtual Keys gir
// brukercontainere tilgang til LLM-modeller uten at de
// noensinne ser den ekte API-nøkkelen (Master Key).
//
// Dokumentasjon: https://docs.litellm.ai/docs/proxy/virtual_keys
// ============================================================

const config = require('../config');

class LiteLLMService {
  constructor() {
    this._baseUrl = config.litellm.internalUrl;
    this._masterKey = config.litellm.masterKey;
  }

  /**
   * Oppretter en Virtual Key i LiteLLM for en ny brukercontainer.
   *
   * Virtual Key-en:
   *   - Identifiserer brukeren (user_id)
   *   - Begrenser tilgang til bestemte modeller
   *   - Setter et budsjett per bruker (for kostnadskontroll)
   *
   * @param {string} userId - Unik brukeridentifikator
   * @returns {Promise<object>} Respons fra LiteLLM med generert key
   * @throws {Error} Hvis forespørselen feiler
   */
  async createVirtualKey(userId) {
    const url = `${this._baseUrl}/key/generate`;

    const body = {
      user_id: userId,
      max_budget: config.litellm.userBudget,
      budget_duration: config.litellm.budgetDuration,
      models: config.litellm.allowedModels,
      metadata: {
        user_id: userId,
        created_by: 'orchestrator',
        created_at: new Date().toISOString(),
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._masterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LiteLLM Virtual Key opprettelse feilet: HTTP ${response.status} — ${errorText}`
      );
    }

    const data = await response.json();
    console.log(`[LiteLLM] Virtual Key opprettet for bruker: ${userId}`);
    return data;
  }
}

module.exports = new LiteLLMService();
