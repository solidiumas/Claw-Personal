// ============================================================
// Claw Personal — Google Auth Service
// ============================================================
// OAuth 2.0 integrasjon mot Google for «Magic Connect».
//
// Denne servicen håndterer hele OAuth-dansen:
//   1. Genererer autorisasjons-URL med riktige scopes
//   2. Veksler autorisasjonskode til access/refresh tokens
//   3. Henter brukerprofil fra Google
//   4. Fornyer access_token med refresh_token
//
// Scopes som forespørres:
//   - openid + email + profile   → Google-innlogging
//   - gmail.readonly             → Les e-post (aldri send/slett)
//   - calendar.readonly          → Les kalenderhendelser
//   - yt-analytics.readonly      → YouTube-kanalstatistikk
//   - youtube.readonly           → YouTube-kanalinfo og videoer
//
// VIKTIG: For at dette skal fungere, må du:
//   1. Opprette et prosjekt i Google Cloud Console
//   2. Aktivere Gmail API, Calendar API, YouTube Analytics API,
//      YouTube Data API v3
//   3. Opprette en OAuth 2.0 Client ID (Web application)
//   4. Legge til redirect URI: http://localhost:3000/auth/google/callback
// ============================================================

const { google } = require('googleapis');
const config = require('../config');

class GoogleAuthService {
  constructor() {
    this._oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
  }

  // ---------------------------------------------------------
  // Autorisasjons-URL
  // ---------------------------------------------------------

  /**
   * Genererer en Google OAuth2 autorisasjons-URL.
   *
   * Denne URL-en sendes brukeren til i nettleseren, der de
   * ser en samtykke-skjerm fra Google og godkjenner scopes.
   *
   * @param {string} state - Tilfeldig streng for CSRF-beskyttelse
   *                         (skal verifiseres i callback)
   * @returns {string}     - Full URL til Google consent screen
   */
  getAuthUrl(state) {
    const url = this._oauth2Client.generateAuthUrl({
      // 'offline' gir oss refresh_token slik at vi kan fornye
      // access_token uten at brukeren må logge inn på nytt.
      access_type: 'offline',

      // Alle scopes vi trenger for NanoClaw
      scope: config.google.scopes,

      // CSRF-beskyttelse: state sendes med og verifiseres i callback
      state,

      // 'consent select_account' tvinger Google til å først vise
      // kontovalg-skjermen (velg hvilken Google-konto), og deretter
      // samtykke-skjermen. Dette sikrer at:
      //   1. Brukeren alltid kan velge riktig Google-konto
      //   2. Vi alltid får refresh_token (consent-delen)
      prompt: 'consent select_account',

      // Inkluder granted scopes for å se nøyaktig hva brukeren godkjente
      include_granted_scopes: true,
    });

    console.log(`[GoogleAuth] Autorisasjons-URL generert`);
    console.log(`[GoogleAuth]   Scopes: ${config.google.scopes.length} stykk`);

    return url;
  }

  // ---------------------------------------------------------
  // Token-veksling
  // ---------------------------------------------------------

  /**
   * Veksler en autorisasjonskode til access/refresh tokens.
   *
   * Etter at brukeren godkjenner på Google consent screen,
   * sender Google en «code» tilbake til callback-URL-en.
   * Denne metoden veksler den koden til faktiske tokens.
   *
   * @param {string} code - Autorisasjonskode fra Google callback
   * @returns {Promise<object>} Token-sett:
   *   {
   *     access_token:  'ya29.xxx...',  // Korttids (1 time)
   *     refresh_token: '1//xxx...',    // Langtids (brukes til å fornye)
   *     expiry_date:   1234567890000,  // Utløpstid i ms
   *     scope:         'openid ...',   // Godkjente scopes
   *     token_type:    'Bearer',
   *     id_token:      'eyJ...'        // JWT med brukerinfo
   *   }
   */
  async exchangeCode(code) {
    console.log(`[GoogleAuth] Veksler autorisasjonskode til tokens...`);

    const { tokens } = await this._oauth2Client.getToken(code);

    console.log(`[GoogleAuth] Tokens mottatt:`);
    console.log(`[GoogleAuth]   Access token:  ${tokens.access_token ? '✅ Mottatt' : '❌ Mangler'}`);
    console.log(`[GoogleAuth]   Refresh token: ${tokens.refresh_token ? '✅ Mottatt' : '❌ Mangler'}`);
    console.log(`[GoogleAuth]   Utløper:       ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Ukjent'}`);
    console.log(`[GoogleAuth]   Scopes:        ${tokens.scope || 'Ikke spesifisert'}`);

    if (!tokens.refresh_token) {
      console.warn(
        '[GoogleAuth] ⚠️  Ingen refresh_token mottatt! ' +
        'Brukeren har kanskje allerede godkjent appen tidligere. ' +
        'Prøv å tilbakekalle tilgang på https://myaccount.google.com/permissions ' +
        'og logg inn på nytt.'
      );
    }

    return tokens;
  }

  // ---------------------------------------------------------
  // Refresh Token
  // ---------------------------------------------------------

  /**
   * Fornyer en utløpt access_token ved hjelp av refresh_token.
   *
   * NanoClaw-containeren kan kalle denne metoden (via Orkestratorens
   * interne API) når den oppdager at access_token er utløpt.
   *
   * @param {string} refreshToken - Gyldig refresh_token
   * @returns {Promise<object>}   - Nye tokens (access_token, expiry_date)
   */
  async refreshAccessToken(refreshToken) {
    console.log(`[GoogleAuth] Fornyer access_token med refresh_token...`);

    // Sett refresh_token på klienten
    this._oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Forny access_token
    const { credentials } = await this._oauth2Client.refreshAccessToken();

    console.log(`[GoogleAuth] Access token fornyet:`);
    console.log(`[GoogleAuth]   Utløper: ${new Date(credentials.expiry_date).toISOString()}`);

    return credentials;
  }

  // ---------------------------------------------------------
  // Brukerprofil
  // ---------------------------------------------------------

  /**
   * Henter Google-profilen til en autentisert bruker.
   *
   * Brukes for å bekrefte brukerens identitet og hente
   * grunnleggende informasjon som e-post og navn.
   *
   * @param {string} accessToken - Gyldig access_token
   * @returns {Promise<object>}  - Brukerprofil:
   *   {
   *     id:      '123456...',
   *     email:   'bruker@gmail.com',
   *     name:    'Ola Nordmann',
   *     picture: 'https://lh3.googleusercontent.com/...'
   *   }
   */
  async getUserProfile(accessToken) {
    console.log(`[GoogleAuth] Henter brukerprofil fra Google...`);

    this._oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const oauth2 = google.oauth2({ version: 'v2', auth: this._oauth2Client });
    const { data } = await oauth2.userinfo.get();

    console.log(`[GoogleAuth] Profil hentet:`);
    console.log(`[GoogleAuth]   E-post: ${data.email}`);
    console.log(`[GoogleAuth]   Navn:   ${data.name}`);

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }
}

module.exports = new GoogleAuthService();
