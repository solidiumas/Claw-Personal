// ============================================================
// Claw Personal — Checkout Routes (Fase 5)
// ============================================================
// Rute for å opprette Stripe Checkout Sessions.
//
// POST /api/create-checkout-session
//   Kalles av frontend (Next.js portal / Fase 6) for å starte
//   betalingsflyten. Returnerer en URL som frontend redirecter
//   brukeren til.
//
// Flyt:
//   Frontend → POST /api/create-checkout-session
//     → Orkestrator oppretter bruker i DB (status: 'pending')
//     → Oppretter Stripe Checkout Session
//     → Returnerer { sessionId, url }
//   Frontend → Redirect til Stripe hosted checkout
//     → Bruker betaler
//     → Stripe → POST /webhook/payment (checkout.session.completed)
//     → Orkestrator provisionerer container
//     → Redirect til Magic Connect
// ============================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/pool');
const stripeService = require('../services/stripe.service');
const { StripeConfigError } = require('../services/stripe.service');

const router = express.Router();

function isStripeRuntimeError(err) {
  return Boolean(err && typeof err.type === 'string' && err.type.startsWith('Stripe'));
}

/**
 * POST /api/create-checkout-session
 *
 * Body (JSON):
 *   {
 *     "email": "bruker@eksempel.no"   (valgfritt, forhåndsutfyller Stripe)
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
  let userId;
  try {
    const { email } = req.body;

    // -----------------------------------------------------------
    // 1. Opprett en ny bruker i DB med status 'pending'
    //    Brukeren får et UUID som følger ham gjennom hele flyten.
    //    Dette IDet sendes som client_reference_id til Stripe og
    //    brukes til å koble checkout.session.completed til riktig rad.
    // -----------------------------------------------------------
    userId = uuidv4();

    await db.query(
      `INSERT INTO users (id, email, license_status)
       VALUES ($1, $2, 'pending')`,
      [userId, email || null]
    );

    console.log(`[Checkout] Ny bruker opprettet: ${userId} (status: pending)`);

    // -----------------------------------------------------------
    // 2. Opprett Stripe Checkout Session
    // -----------------------------------------------------------
    const { sessionId, url } = await stripeService.createCheckoutSession({
      userId,
      email,
    });

    // -----------------------------------------------------------
    // 3. Returner session-info til frontend
    // -----------------------------------------------------------
    return res.status(200).json({
      success: true,
      userId,
      sessionId,
      url,
    });

  } catch (err) {
    if (userId) {
      try {
        await db.query('DELETE FROM users WHERE id = $1 AND license_status = $2', [userId, 'pending']);
      } catch (cleanupErr) {
        console.error(`[Checkout] Feil ved opprydding av bruker ${userId}: ${cleanupErr.message}`);
      }
    }

    if (err instanceof StripeConfigError) {
      console.error(`[Checkout] Ugyldig Stripe-konfig: ${err.message}`);
      return res.status(503).json({
        success: false,
        error: 'Betaling er midlertidig utilgjengelig. Stripe-oppsett mangler eller er ugyldig.',
      });
    }

    if (isStripeRuntimeError(err)) {
      console.error(`[Checkout] Stripe-feil (${err.type}${err.code ? `/${err.code}` : ''}): ${err.message}`);
      return res.status(503).json({
        success: false,
        error: 'Betaling er midlertidig utilgjengelig. Stripe avviste forespørselen.',
      });
    }

    console.error(`[Checkout] Feil ved opprettelse av Checkout Session: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Kunne ikke opprette betalingsøkt. Prøv igjen.',
    });
  }
});

module.exports = router;
