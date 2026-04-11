// ============================================================
// Claw Personal — Token Service
// ============================================================
// Håndterer generering av tilfeldige interne tokens og
// lagring av koblingen mellom brukerID og token.
//
// Interne tokens brukes til å autentisere NanoClaw-containere
// mot LLM Gateway (LiteLLM). Hver brukercontainer får en unik
// token som injiseres som miljøvariabel ved opprettelse.
//
// VIKTIG: I produksjon bør dette erstattes med en database
// eller en sikker nøkkelhåndterer (f.eks. HashiCorp Vault).
// ============================================================

const crypto = require('crypto');

class TokenService {
  constructor() {
    // In-memory lagring av userId → token kobling
    // I produksjon: erstatt med PostgreSQL / Redis / Vault
    this._tokenStore = new Map();
  }

  /**
   * Genererer en kryptografisk sikker, tilfeldig intern token.
   * @returns {string} En 64-tegn hex-streng
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Lagrer koblingen mellom en brukerID og en intern token.
   * @param {string} userId - Unik brukeridentifikator
   * @param {string} token  - Generert intern token
   */
  storeToken(userId, token) {
    this._tokenStore.set(userId, {
      token,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Henter den lagrede tokenen for en bruker.
   * @param {string} userId - Unik brukeridentifikator
   * @returns {object|null} Token-objekt med { token, createdAt } eller null
   */
  getToken(userId) {
    return this._tokenStore.get(userId) || null;
  }

  /**
   * Fjerner en token for en bruker (f.eks. ved avslutning).
   * @param {string} userId - Unik brukeridentifikator
   * @returns {boolean} true hvis tokenen ble fjernet, false ellers
   */
  revokeToken(userId) {
    return this._tokenStore.delete(userId);
  }

  /**
   * Genererer en intern token og lagrer koblingen til brukerID.
   * @param {string} userId - Unik brukeridentifikator
   * @returns {string} Den genererte tokenen
   */
  createAndStoreToken(userId) {
    const token = this.generateToken();
    this.storeToken(userId, token);
    return token;
  }
}

module.exports = new TokenService();
