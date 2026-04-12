// ============================================================
// Claw Personal — Token Service (Fase 4: PostgreSQL)
// ============================================================
// Håndterer generering av tilfeldige interne tokens og
// lagring av koblingen mellom brukerID og token.
//
// Interne tokens brukes til å autentisere NanoClaw-containere
// mot LLM Gateway (LiteLLM). Hver brukercontainer får en unik
// token som injiseres som miljøvariabel ved opprettelse.
//
// Fase 2: In-memory Map (prototype)
// Fase 4: Migrert til PostgreSQL (persistent lagring)
// ============================================================

const crypto = require('crypto');
const db = require('../db/pool');

class TokenService {
  /**
   * Genererer en kryptografisk sikker, tilfeldig intern token.
   * @returns {string} En 64-tegn hex-streng
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Lagrer koblingen mellom en brukerID og en intern token.
   *
   * Bruker UPSERT (ON CONFLICT) slik at en bruker kun
   * har én aktiv intern token om gangen.
   *
   * @param {string} userId - Unik brukeridentifikator (UUID)
   * @param {string} token  - Generert intern token
   */
  async storeToken(userId, token) {
    await db.query(
      `INSERT INTO internal_tokens (user_id, token)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET token = $2, created_at = NOW()`,
      [userId, token]
    );
  }

  /**
   * Henter den lagrede tokenen for en bruker.
   *
   * @param {string} userId - Unik brukeridentifikator (UUID)
   * @returns {Promise<object|null>} Token-objekt med { token, createdAt } eller null
   */
  async getToken(userId) {
    const result = await db.query(
      `SELECT token, created_at AS "createdAt"
       FROM internal_tokens
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    return {
      token: result.rows[0].token,
      createdAt: result.rows[0].createdAt,
    };
  }

  /**
   * Fjerner en token for en bruker (f.eks. ved avslutning).
   *
   * @param {string} userId - Unik brukeridentifikator (UUID)
   * @returns {Promise<boolean>} true hvis tokenen ble fjernet
   */
  async revokeToken(userId) {
    const result = await db.query(
      `DELETE FROM internal_tokens WHERE user_id = $1`,
      [userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Genererer en intern token og lagrer koblingen til brukerID.
   *
   * @param {string} userId - Unik brukeridentifikator (UUID)
   * @returns {Promise<string>} Den genererte tokenen
   */
  async createAndStoreToken(userId) {
    const token = this.generateToken();
    await this.storeToken(userId, token);
    return token;
  }
}

module.exports = new TokenService();
