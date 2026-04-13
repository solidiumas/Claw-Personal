// ============================================================
// Claw Personal — Vault Routes (Fase 7: NanoClaw Data Plane)
// ============================================================
// Internt API for NanoClaw-containere til å hente dekrypterte
// OAuth-tokens fra The Vault.
//
// Disse rutene er KUN tilgjengelige innad i claw-internal-
// nettverket. NanoClaw-containere autentiserer seg med sin
// INTERNAL_TOKEN (injisert som miljøvariabel ved opprettelse).
//
// Ruter:
//   GET  /vault/tokens          → Hent dekrypterte tokens
//   POST /vault/tokens/refresh  → Forny utløpt access_token
//
// Sikkerhet:
//   - Bearer token-autentisering (INTERNAL_TOKEN)
//   - Token valideres mot internal_tokens-tabellen i PostgreSQL
//   - Tokens returneres KUN over det interne Docker-nettverket
//   - Ingen tokens caches på disk — alt er in-memory
// ============================================================

const express = require('express');
const db = require('../db/pool');
const vaultService = require('../services/vault.service');
const googleAuthService = require('../services/google-auth.service');

const router = express.Router();

// -----------------------------------------------------------
// Middleware: Autentiser NanoClaw-container
// -----------------------------------------------------------
// Verifiserer at forespørselen kommer fra en gyldig
// NanoClaw-container med en aktiv INTERNAL_TOKEN.
//
// Henter bruker-ID fra internal_tokens-tabellen og legger
// den på req.userId for bruk i nedstrøms-handlers.
// -----------------------------------------------------------
async function authenticateContainer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Mangler Authorization header (Bearer <INTERNAL_TOKEN>)',
    });
  }

  const token = authHeader.slice(7); // Fjern "Bearer "

  try {
    // Slå opp token i databasen
    const result = await db.query(
      `SELECT it.user_id, u.license_status
       FROM internal_tokens it
       JOIN users u ON u.id = it.user_id
       WHERE it.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      console.warn(`[Vault API] Ugyldig INTERNAL_TOKEN forsøkt brukt`);
      return res.status(401).json({
        success: false,
        error: 'Ugyldig INTERNAL_TOKEN. Autentisering feilet.',
      });
    }

    const { user_id, license_status } = result.rows[0];

    // Sjekk at brukeren har aktiv lisens
    if (license_status !== 'active') {
      console.warn(`[Vault API] Bruker ${user_id} har inaktiv lisens: ${license_status}`);
      return res.status(403).json({
        success: false,
        error: `Brukerens lisens er ikke aktiv (status: ${license_status})`,
      });
    }

    // Alt OK — legg userId på request-objektet
    req.userId = user_id;
    next();

  } catch (err) {
    console.error(`[Vault API] Autentiseringsfeil: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Intern feil under autentisering',
    });
  }
}

// Bruk autentisering på alle /vault-ruter
router.use(authenticateContainer);

// -----------------------------------------------------------
// GET /vault/tokens
// -----------------------------------------------------------
// Henter og dekrypterer OAuth-tokens for den autentiserte
// containeren (identifisert via INTERNAL_TOKEN).
//
// Tokens dekrypteres fra PostgreSQL via VaultService og
// returneres KUN over det interne nettverket.
//
// Response:
//   {
//     success: true,
//     tokens: {
//       access_token:  "ya29.xxx...",
//       refresh_token: "1//xxx...",
//       expiry_date:   1234567890000,
//       scope:         "openid ...",
//       token_type:    "Bearer"
//     }
//   }
// -----------------------------------------------------------
router.get('/tokens', async (req, res) => {
  const userId = req.userId;

  console.log(`[Vault API] Token-forespørsel for bruker: ${userId}`);

  try {
    const tokens = await vaultService.getUserTokens(userId);

    if (!tokens) {
      return res.status(404).json({
        success: false,
        error: 'Ingen tokens funnet. Brukeren har ikke fullført OAuth ennå.',
      });
    }

    console.log(`[Vault API] ✅ Tokens dekryptert og sendt til container`);

    return res.status(200).json({
      success: true,
      tokens,
    });

  } catch (err) {
    console.error(`[Vault API] Dekrypteringsfeil: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Kunne ikke dekryptere tokens fra Vault.',
    });
  }
});

// -----------------------------------------------------------
// POST /vault/tokens/refresh
// -----------------------------------------------------------
// Fornyer en utløpt access_token ved hjelp av refresh_token.
//
// NanoClaw-containeren kaller dette endepunktet når den
// oppdager at access_token er utløpt under kjøring.
//
// Flyten:
//   1. Hent eksisterende tokens fra Vault (dekrypter)
//   2. Bruk refresh_token til å fornye access_token
//   3. Krypter og lagre oppdaterte tokens tilbake i Vault
//   4. Returner nye tokens til containeren
// -----------------------------------------------------------
router.post('/tokens/refresh', async (req, res) => {
  const userId = req.userId;

  console.log(`[Vault API] Token-fornyelse for bruker: ${userId}`);

  try {
    // 1. Hent eksisterende tokens
    const currentTokens = await vaultService.getUserTokens(userId);

    if (!currentTokens || !currentTokens.refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'Ingen refresh_token funnet. Brukeren må re-autorisere.',
      });
    }

    // 2. Forny access_token via Google
    const refreshedCredentials = await googleAuthService.refreshAccessToken(
      currentTokens.refresh_token
    );

    // 3. Oppdater tokens med ny access_token og expiry
    const updatedTokens = {
      ...currentTokens,
      access_token: refreshedCredentials.access_token,
      expiry_date: refreshedCredentials.expiry_date,
    };

    // 4. Krypter og lagre tilbake i Vault
    await vaultService.storeUserTokens(userId, updatedTokens);

    console.log(`[Vault API] ✅ Access token fornyet for bruker: ${userId}`);

    return res.status(200).json({
      success: true,
      tokens: updatedTokens,
    });

  } catch (err) {
    console.error(`[Vault API] Token-fornyelse feilet: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: `Token-fornyelse feilet: ${err.message}`,
    });
  }
});

module.exports = router;
