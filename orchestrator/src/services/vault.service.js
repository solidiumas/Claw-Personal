// ============================================================
// Claw Personal — The Vault (Fase 4: PostgreSQL)
// ============================================================
// Sikker lagring av bruker-sensitive data (OAuth-tokens etc.)
// ved hjelp av Zero-Knowledge-kryptering.
//
// KONSEPT: "Zero-Knowledge" betyr at selv om databasen
// kompromitteres, er dataene verdiløse uten Vault Master Key.
//
// Slik fungerer det:
//   1. En VAULT_MASTER_KEY holdes kun i minne i Orkestratoren.
//   2. For hver bruker avleder vi en unik nøkkel via scrypt:
//      userKey = scrypt(VAULT_MASTER_KEY, salt=userId)
//   3. Data krypteres med AES-256-GCM (authenticated encryption).
//   4. Databasen lagrer kun { iv, authTag, ciphertext } —
//      alt er "gibberish" uten den avledede nøkkelen.
//
// Fase 3: In-memory Map (prototype)
// Fase 4: Migrert til PostgreSQL (persistent lagring)
// ============================================================

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');

// Konstanter for krypteringsalgoritmen
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;        // 128 bits — anbefalt for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits — full autentiseringsstyrke
const KEY_LENGTH = 32;       // 256 bits — for AES-256
const SCRYPT_COST = 16384;   // N=2^14 — balanse mellom sikkerhet og hastighet
const SCRYPT_BLOCK = 8;      // r
const SCRYPT_PARALLEL = 1;   // p

class VaultService {
  constructor() {
    // Master Key lastes fra miljøvariabel
    this._masterKey = config.vault.masterKey;

    if (!this._masterKey) {
      console.warn(
        '[Vault] ⚠️  VAULT_MASTER_KEY er ikke satt! ' +
        'Genererer en midlertidig nøkkel for utvikling. ' +
        'ALDRI gjør dette i produksjon!'
      );
      this._masterKey = crypto.randomBytes(32).toString('hex');
    }
  }

  // ---------------------------------------------------------
  // Nøkkelavledning (Key Derivation)
  // ---------------------------------------------------------

  /**
   * Avleder en unik krypteringsnøkkel for en spesifikk bruker.
   *
   * Bruker scrypt (minnekrevende KDF) for å gjøre brute-force
   * umulig selv om angriperen har tilgang til ciphertext.
   *
   * @param {string} userId - Unik brukeridentifikator (brukes som salt)
   * @returns {Buffer}      - 32-byte (256-bit) avledet nøkkel
   */
  _deriveUserKey(userId) {
    // Salt = userId konvertert til buffer
    // Siden userId er unik per bruker, får hver bruker sin egen nøkkel
    const salt = Buffer.from(userId, 'utf8');

    return crypto.scryptSync(
      this._masterKey,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK,
        p: SCRYPT_PARALLEL,
      }
    );
  }

  // ---------------------------------------------------------
  // Kryptering / Dekryptering
  // ---------------------------------------------------------

  /**
   * Krypterer vilkårlig tekst med brukerens avledede nøkkel.
   *
   * @param {string} userId    - Bruker-ID for nøkkelavledning
   * @param {string} plaintext - Klartekst som skal krypteres
   * @returns {object}         - { iv, authTag, ciphertext } (alt hex-kodet)
   */
  encrypt(userId, plaintext) {
    const key = this._deriveUserKey(userId);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: encrypted,
    };
  }

  /**
   * Dekrypterer data tilbake til klartekst.
   *
   * @param {string} userId          - Bruker-ID for nøkkelavledning
   * @param {object} encryptedPayload - { iv, authTag, ciphertext }
   * @returns {string}                - Dekryptert klartekst
   * @throws {Error} Hvis dekryptering feiler (feil nøkkel, manipulert data)
   */
  decrypt(userId, encryptedPayload) {
    const { iv, authTag, ciphertext } = encryptedPayload;
    const key = this._deriveUserKey(userId);

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex'),
      { authTagLength: AUTH_TAG_LENGTH }
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // ---------------------------------------------------------
  // Token-lagring (OAuth tokens) — PostgreSQL
  // ---------------------------------------------------------

  /**
   * Krypterer og lagrer et sett med OAuth-tokens for en bruker.
   *
   * Tokens-objektet bør inneholde:
   *   - access_token:  Korttids-token for API-tilgang
   *   - refresh_token: Langtids-token for å fornye access_token
   *   - expiry_date:   Utløpstidspunkt for access_token
   *   - scope:         Godkjente scopes fra brukeren
   *   - token_type:    Vanligvis "Bearer"
   *
   * Bruker UPSERT (ON CONFLICT) slik at re-autorisering
   * overskriver eksisterende tokens for brukeren.
   *
   * @param {string} userId - Bruker-ID (UUID)
   * @param {object} tokens - OAuth token-sett fra Google
   */
  async storeUserTokens(userId, tokens) {
    const plaintext = JSON.stringify(tokens);
    const encrypted = this.encrypt(userId, plaintext);

    await db.query(
      `INSERT INTO user_tokens (user_id, iv, auth_tag, ciphertext)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         iv         = $2,
         auth_tag   = $3,
         ciphertext = $4,
         updated_at = NOW()`,
      [userId, encrypted.iv, encrypted.authTag, encrypted.ciphertext]
    );

    console.log(`[Vault] OAuth-tokens kryptert og lagret for bruker: ${userId}`);
    console.log(`[Vault]   Ciphertext lengde: ${encrypted.ciphertext.length} tegn`);
    console.log(`[Vault]   Algoritme: ${ALGORITHM}`);
    console.log(`[Vault]   Lagret i: PostgreSQL (user_tokens)`);
  }

  /**
   * Henter og dekrypterer OAuth-tokens for en bruker.
   *
   * @param {string} userId - Bruker-ID (UUID)
   * @returns {Promise<object|null>} - Dekryptert token-sett eller null
   */
  async getUserTokens(userId) {
    const result = await db.query(
      `SELECT iv, auth_tag AS "authTag", ciphertext
       FROM user_tokens
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.log(`[Vault] Ingen tokens funnet for bruker: ${userId}`);
      return null;
    }

    try {
      const encrypted = result.rows[0];
      const plaintext = this.decrypt(userId, encrypted);
      const tokens = JSON.parse(plaintext);

      console.log(`[Vault] Tokens dekryptert for bruker: ${userId}`);
      return tokens;
    } catch (err) {
      console.error(`[Vault] Dekryptering feilet for bruker ${userId}: ${err.message}`);
      throw new Error('Kunne ikke dekryptere tokens. Mulig korrupt data eller feil nøkkel.');
    }
  }

  /**
   * Sjekker om en bruker har lagrede tokens i Vault.
   *
   * @param {string} userId - Bruker-ID (UUID)
   * @returns {Promise<boolean>} - true hvis tokens finnes
   */
  async hasTokens(userId) {
    const result = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM user_tokens WHERE user_id = $1
      ) AS "exists"`,
      [userId]
    );
    return result.rows[0].exists;
  }

  /**
   * Fjerner alle lagrede tokens for en bruker.
   * Brukes ved avslutning av abonnement eller tilbaketrekking av samtykke.
   *
   * @param {string} userId - Bruker-ID (UUID)
   * @returns {Promise<boolean>} - true hvis tokens ble fjernet
   */
  async revokeTokens(userId) {
    const result = await db.query(
      `DELETE FROM user_tokens WHERE user_id = $1`,
      [userId]
    );
    const deleted = result.rowCount > 0;
    if (deleted) {
      console.log(`[Vault] Tokens slettet for bruker: ${userId}`);
    }
    return deleted;
  }
}

module.exports = new VaultService();
