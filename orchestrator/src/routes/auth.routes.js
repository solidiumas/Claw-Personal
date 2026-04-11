// ============================================================
// Claw Personal — Auth Routes (Magic Connect)
// ============================================================
// OAuth 2.0 ruter for «Magic Connect»-onboarding.
//
// Disse rutene lar YouTube-innholdsprodusenter koble sin
// Google-konto til NanoClaw slik at agenten får tilgang til:
//   - Gmail (read-only) — for å analysere innboksen
//   - Google Calendar    — for å lese kalenderhendelser
//   - YouTube Analytics  — for å hente kanalstatistikk
//   - YouTube Data       — for å hente kanalinfo/videoer
//
// Flyten:
//   1. GET /auth/google          → Redirect til Google consent
//   2. GET /auth/google/callback → Mottar tokens, lagrer i Vault
//   3. GET /auth/status/:userId  → Sjekker om tokens er lagret
//
// Sikkerhet:
//   - CSRF-beskyttelse via state-parameter i sesjon
//   - Tokens krypteres med Zero-Knowledge i The Vault
//   - Etter lagring sendes wake-signal til NanoClaw-containeren
// ============================================================

const express = require('express');
const crypto = require('crypto');
const googleAuthService = require('../services/google-auth.service');
const vaultService = require('../services/vault.service');
const dockerService = require('../services/docker.service');

const router = express.Router();

// -----------------------------------------------------------
// GET /auth/google
// -----------------------------------------------------------
// Starter OAuth-flyten. Genererer en tilfeldig state-parameter
// for CSRF-beskyttelse, lagrer den i sesjonen, og redirecter
// brukeren til Googles samtykke-skjerm.
//
// Query-parametere (valgfritt):
//   ?userId=user-001  — Bruker-ID for å koble tokens til rett
//                        bruker. Må sendes med fra frontend.
// -----------------------------------------------------------
router.get('/google', (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Mangler påkrevd query-parameter: userId',
        hint: 'Bruk: GET /auth/google?userId=din-bruker-id',
      });
    }

    // Generer tilfeldig state for CSRF-beskyttelse
    const state = crypto.randomBytes(16).toString('hex');

    // Lagre state og userId i sesjonen for verifisering i callback
    req.session.oauthState = state;
    req.session.oauthUserId = userId;

    // Generer Google consent URL
    const authUrl = googleAuthService.getAuthUrl(state);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Auth] OAuth-flyt startet for bruker: ${userId}`);
    console.log(`[Auth] Redirecter til Google consent...`);
    console.log(`${'='.repeat(60)}`);

    // Redirect brukeren til Google
    return res.redirect(authUrl);

  } catch (err) {
    console.error(`[Auth] Feil ved start av OAuth-flyt: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Kunne ikke starte OAuth-flyt',
    });
  }
});

// -----------------------------------------------------------
// GET /auth/google/callback
// -----------------------------------------------------------
// Callback fra Google etter at brukeren har godkjent (eller
// avslått) tilgang. Denne ruten:
//
//   1. Verifiserer state-parameteren (CSRF-sjekk)
//   2. Veksler autorisasjonkoden til access/refresh tokens
//   3. Henter brukerens Google-profil
//   4. Krypterer og lagrer tokens i The Vault
//   5. Sender wake-signal til brukerens NanoClaw-container
//   6. Redirecter til suksess-side (eller returnerer JSON)
// -----------------------------------------------------------
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Sjekk om brukeren avbrøt OAuth-flyten
    if (error) {
      console.warn(`[Auth] Brukeren avbrøt OAuth: ${error}`);
      return res.status(400).json({
        success: false,
        error: `OAuth avbrutt av brukeren: ${error}`,
      });
    }

    // Hent lagret state og userId fra sesjonen
    const savedState = req.session.oauthState;
    const userId = req.session.oauthUserId;

    // -----------------------------------------------------------
    // 1. Verifiser state (CSRF-beskyttelse)
    // -----------------------------------------------------------
    if (!state || !savedState || state !== savedState) {
      console.error(`[Auth] State mismatch! Mulig CSRF-angrep.`);
      console.error(`[Auth]   Mottatt:  ${state}`);
      console.error(`[Auth]   Forventet: ${savedState}`);
      return res.status(403).json({
        success: false,
        error: 'Ugyldig state-parameter. Mulig CSRF-angrep. Prøv på nytt.',
      });
    }

    if (!userId) {
      console.error(`[Auth] Ingen userId i sesjonen. Sesjon kan ha utløpt.`);
      return res.status(400).json({
        success: false,
        error: 'Sesjonen har utløpt. Start OAuth-flyten på nytt.',
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Mangler autorisasjonskode fra Google.',
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Auth] Callback mottatt for bruker: ${userId}`);
    console.log(`${'='.repeat(60)}`);

    // -----------------------------------------------------------
    // 2. Veksle autorisasjonskoden til tokens
    // -----------------------------------------------------------
    const tokens = await googleAuthService.exchangeCode(code);

    // -----------------------------------------------------------
    // 3. Hent brukerprofil fra Google
    // -----------------------------------------------------------
    let profile = null;
    try {
      profile = await googleAuthService.getUserProfile(tokens.access_token);
    } catch (err) {
      console.warn(`[Auth] Kunne ikke hente profil: ${err.message}`);
      // Ikke kritisk — vi fortsetter uten profil
    }

    // -----------------------------------------------------------
    // 4. Krypter og lagre tokens i The Vault
    //    (Zero-Knowledge: kun Orkestratoren kan dekryptere)
    // -----------------------------------------------------------
    const tokenPayload = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
      // Lagre brukerinfo sammen med tokens
      profile: profile ? {
        email: profile.email,
        name: profile.name,
        googleId: profile.id,
      } : null,
    };

    vaultService.storeUserTokens(userId, tokenPayload);

    // Rydd opp sesjonen
    delete req.session.oauthState;
    delete req.session.oauthUserId;

    // -----------------------------------------------------------
    // 5. Send wake-signal til brukerens NanoClaw-container
    //    "Du har fått tilgang. Start initialiserings-protokoll."
    // -----------------------------------------------------------
    let wakeResult = null;
    try {
      wakeResult = await dockerService.wakeContainer(userId);
      console.log(`[Auth] Wake-signal sendt til container for bruker: ${userId}`);
    } catch (err) {
      // Container finnes kanskje ikke ennå (betaling ikke fullført)
      // Dette er OK — containeren vil hente tokens når den starter
      console.warn(`[Auth] Kunne ikke sende wake-signal: ${err.message}`);
      console.warn(`[Auth] Containeren vil hente tokens ved neste oppstart.`);
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`[Auth] ✅ OAuth fullført for bruker: ${userId}`);
    console.log(`[Auth]   E-post:    ${profile?.email || 'Ukjent'}`);
    console.log(`[Auth]   Tokens:    Kryptert i Vault`);
    console.log(`[Auth]   Container: ${wakeResult ? 'Vekket' : 'Venter'}`);
    console.log(`${'='.repeat(60)}\n`);

    // -----------------------------------------------------------
    // 6. Returner suksess
    //
    // PRODUKSJON: Redirect til frontend suksess-side:
    //   const frontendUrl = process.env.FRONTEND_SUCCESS_URL || 'http://localhost:3001/onboarding/success';
    //   return res.redirect(`${frontendUrl}?userId=${userId}`);
    // -----------------------------------------------------------
    return res.status(200).json({
      success: true,
      message: 'Magic Connect fullført! Din NanoClaw-agent er nå aktiv.',
      userId,
      profile: profile ? {
        email: profile.email,
        name: profile.name,
      } : null,
      containerAwake: !!wakeResult,
    });

  } catch (err) {
    console.error(`[Auth] Feil i OAuth callback: ${err.message}`);
    console.error(err.stack);
    return res.status(500).json({
      success: false,
      error: `OAuth callback feilet: ${err.message}`,
    });
  }
});

// -----------------------------------------------------------
// GET /auth/status/:userId
// -----------------------------------------------------------
// Sjekker om en bruker har fullført OAuth og har lagrede
// tokens i The Vault. Returnerer kun en boolean, ALDRI
// selve tokenene — dette er Zero-Knowledge-prinsippet.
// -----------------------------------------------------------
router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'Mangler userId parameter',
    });
  }

  const hasTokens = vaultService.hasTokens(userId);

  return res.status(200).json({
    success: true,
    userId,
    connected: hasTokens,
    message: hasTokens
      ? 'Brukeren har koblet til Google (tokens lagret i Vault)'
      : 'Brukeren har ikke koblet til Google ennå',
  });
});

module.exports = router;
