// ============================================================
// Claw Personal — Checkout Routes (Fase 5 + 8)
// ============================================================
// Rute for å opprette Stripe Checkout Sessions.
//
// POST /api/create-checkout-session
//   Kalles av frontend (Next.js portal) for å starte
//   betalingsflyten. Returnerer en URL som frontend redirecter
//   brukeren til.
//
// Fase 8: YouTube-kanalen samles inn FØR betaling og sendes
// som metadata til Stripe. Den lagres i DB og sendes med i
// Stripe metadata så webhook kan hente den ut.
//
// Flyt:
//   Frontend → POST /api/create-checkout-session { youtubeUrl }
//     → Parse YouTube-handle
//     → Opprett bruker i DB med youtube_handle + channel_url
//     → Opprett Stripe Checkout Session (handle i metadata)
//     → Returnerer { sessionId, url }
//   Frontend → Redirect til Stripe hosted checkout
//     → Bruker betaler
//     → Stripe → POST /webhook/payment (checkout.session.completed)
//     → Webhook lagrer handle + aktiverer bruker
//     → Redirect til /dashboard (IKKE /magic-connect)
// ============================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/pool');
const stripeService = require('../services/stripe.service');

const router = express.Router();

// ============================================================
// Hjelpefunksjon: Normaliser YouTube URL → @Handle
// ============================================================
// Støtter disse formatene:
//   https://youtube.com/@Janovich
//   https://www.youtube.com/@Janovich
//   https://youtube.com/c/ChannelName
//   @Janovich
//   Janovich
// ============================================================
function parseYoutubeHandle(input) {
  if (!input) return null;
  const trimmed = input.trim();

  // youtube.com/@Handle
  const atMatch = trimmed.match(/youtube\.com\/@([\w-]+)/i);
  if (atMatch) return `@${atMatch[1]}`;

  // youtube.com/c/ChannelName
  const cMatch = trimmed.match(/youtube\.com\/c\/([\w-]+)/i);
  if (cMatch) return `@${cMatch[1]}`;

  // youtube.com/user/ChannelName
  const userMatch = trimmed.match(/youtube\.com\/user\/([\w-]+)/i);
  if (userMatch) return `@${userMatch[1]}`;

  // youtube.com/ChannelName (uten prefix)
  const plainMatch = trimmed.match(/youtube\.com\/([\w-]+)/i);
  if (plainMatch && plainMatch[1] !== 'watch') return `@${plainMatch[1]}`;

  // Allerede @Handle
  if (trimmed.startsWith('@')) return trimmed;

  // Bare et navn — legg til @
  if (/^[\w-]+$/.test(trimmed)) return `@${trimmed}`;

  return null;
}

/**
 * POST /api/create-checkout-session
 *
 * Body (JSON):
 *   {
 *     "youtubeUrl": "https://youtube.com/@Janovich"  (påkrevd)
 *     "email":      "bruker@eksempel.no"             (valgfritt)
 *   }
 *
 * Respons (200 OK):
 *   {
 *     "success": true,
 *     "userId": "<uuid>",
 *     "sessionId": "cs_...",
 *     "url": "https://checkout.stripe.com/..."
 *   }
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { youtubeUrl, email } = req.body;

    // -----------------------------------------------------------
    // 1. Valider og parse YouTube-handle (Fase 8)
    // -----------------------------------------------------------
    if (!youtubeUrl || !youtubeUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: 'YouTube-kanal er påkrevd. Lim inn URL-en eller handle (@KanalNavn).',
      });
    }

    const youtubeHandle = parseYoutubeHandle(youtubeUrl);
    if (!youtubeHandle) {
      return res.status(400).json({
        success: false,
        error: 'Ugyldig YouTube-URL. Prøv f.eks. https://youtube.com/@KanalNavn eller @KanalNavn.',
      });
    }

    console.log(`[Checkout] YouTube handle parset: "${youtubeUrl}" → "${youtubeHandle}"`);

    // -----------------------------------------------------------
    // 2. Opprett en ny bruker i DB med status 'pending'
    //    Lagre YouTube-handle og original URL (Fase 8).
    // -----------------------------------------------------------
    const userId = uuidv4();

    await db.query(
      `INSERT INTO users (id, email, youtube_handle, channel_url, license_status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [userId, email || null, youtubeHandle, youtubeUrl.trim()]
    );

    console.log(`[Checkout] Ny bruker opprettet: ${userId}`);
    console.log(`[Checkout]   Handle: ${youtubeHandle}`);
    console.log(`[Checkout]   Status: pending`);

    // -----------------------------------------------------------
    // 3. Opprett Stripe Checkout Session med handle i metadata
    // -----------------------------------------------------------
    const { sessionId, url } = await stripeService.createCheckoutSession({
      userId,
      email,
      youtubeHandle,
    });

    // -----------------------------------------------------------
    // 4. Returner session-info til frontend
    // -----------------------------------------------------------
    return res.status(200).json({
      success: true,
      userId,
      youtubeHandle,
      sessionId,
      url,
    });

  } catch (err) {
    console.error(`[Checkout] Feil ved opprettelse av Checkout Session: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Kunne ikke opprette betalingsøkt. Prøv igjen.',
    });
  }
});

module.exports = router;
