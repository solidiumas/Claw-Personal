// ============================================================
// Claw Personal — The Vault (Zero-Knowledge Kryptering)
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
// PRODUKSJONSNOTER:
//   - Erstatt in-memory Map med PostgreSQL / Redis
//   - Vurder HashiCorp Vault for enterprise-grade KMS
//   - Roter VAULT_MASTER_KEY med en migrasjonsstrategi
//   - Legg til audit-logging for alle dekrypteringsoperasjoner
// ============================================================

const crypto = require('crypto');
const config = require('../config');

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
    // -------------------------------------------------------
    // In-memory lagring av krypterte tokens per bruker.
    //
    // PRODUKSJON: Erstatt denne Map-en med en persistent
    // database (PostgreSQL med kryptert kolonne, Redis med
    // disk-persistens, eller en dedikert KMS-tjeneste).
    //
    // Strukturen er:
    //   userId → { iv, authTag, ciphertext, createdAt, updatedAt }
    // -------------------------------------------------------
    this._store = new Map();

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
  // Token-lagring (OAuth tokens)
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
   * PRODUKSJON: Denne metoden bør skrive til PostgreSQL i stedet
   * for den in-memory Map-en. Eksempel SQL:
   *
   *   INSERT INTO user_tokens (user_id, iv, auth_tag, ciphertext, updated_at)
   *   VALUES ($1, $2, $3, $4, NOW())
   *   ON CONFLICT (user_id) DO UPDATE SET ...
   *
   * @param {string} userId - Bruker-ID
   * @param {object} tokens - OAuth token-sett fra Google
   */
  storeUserTokens(userId, tokens) {
    const plaintext = JSON.stringify(tokens);
    const encrypted = this.encrypt(userId, plaintext);

    this._store.set(userId, {
      ...encrypted,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Vault] OAuth-tokens kryptert og lagret for bruker: ${userId}`);
    console.log(`[Vault]   Ciphertext lengde: ${encrypted.ciphertext.length} tegn`);
    console.log(`[Vault]   Algoritme: ${ALGORITHM}`);

    // PRODUKSJON: Legg til audit-logging her
    // auditLog.write({ action: 'STORE_TOKENS', userId, timestamp: Date.now() });
  }

  /**
   * Henter og dekrypterer OAuth-tokens for en bruker.
   *
   * PRODUKSJON: Denne metoden bør lese fra PostgreSQL:
   *
   *   SELECT iv, auth_tag, ciphertext FROM user_tokens
   *   WHERE user_id = $1
   *
   * @param {string} userId - Bruker-ID
   * @returns {object|null} - Dekryptert token-sett eller null
   */
  getUserTokens(userId) {
    const encrypted = this._store.get(userId);

    if (!encrypted) {
      console.log(`[Vault] Ingen tokens funnet for bruker: ${userId}`);
      return null;
    }

    try {
      const plaintext = this.decrypt(userId, encrypted);
      const tokens = JSON.parse(plaintext);

      console.log(`[Vault] Tokens dekryptert for bruker: ${userId}`);
      // PRODUKSJON: Legg til audit-logging her
      // auditLog.write({ action: 'RETRIEVE_TOKENS', userId, timestamp: Date.now() });

      return tokens;
    } catch (err) {
      console.error(`[Vault] Dekryptering feilet for bruker ${userId}: ${err.message}`);
      throw new Error('Kunne ikke dekryptere tokens. Mulig korrupt data eller feil nøkkel.');
    }
  }

  /**
   * Sjekker om en bruker har lagrede tokens i Vault.
   *
   * @param {string} userId - Bruker-ID
   * @returns {boolean}     - true hvis tokens finnes
   */
  hasTokens(userId) {
    return this._store.has(userId);
  }

  /**
   * Fjerner alle lagrede tokens for en bruker.
   * Brukes ved avslutning av abonnement eller tilbaketrekking av samtykke.
   *
   * @param {string} userId - Bruker-ID
   * @returns {boolean}     - true hvis tokens ble fjernet
   */
  revokeTokens(userId) {
    const deleted = this._store.delete(userId);
    if (deleted) {
      console.log(`[Vault] Tokens slettet for bruker: ${userId}`);
      // PRODUKSJON: Legg til audit-logging
    }
    return deleted;
  }
}

module.exports = new VaultService();
