// ============================================================
// Claw Personal — Stripe Service (Fase 5)
// ============================================================
// Wrapper rundt Stripe SDK for to operasjoner:
//
//   1. Opprette Checkout Sessions (for frontend → betaling)
//   2. Verifisere webhook-signaturer via constructEvent()
//
// Alle Stripe API-kall skjer kun server-side. Hemmelige
// nøkler er aldri eksponert på klientsiden.
// ============================================================

const Stripe = require('stripe');
const config = require('../config');

class StripeService {
  constructor() {
    if (!config.stripe.secretKey) {
      console.warn('[Stripe] ⚠️  STRIPE_SECRET_KEY er ikke satt. Betalingsfunksjoner vil feile.');
    }
    // Initialiser Stripe med API-versjon låst for stabilitet
    this._stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2025-03-31.basil',
    });
  }

  /**
   * Oppretter en Stripe Checkout Session for et nytt abonnement.
   *
   * Dette er startpunktet for betalingsflyten. Frontend kaller
   * POST /api/create-checkout-session og redirecter brukeren til
   * den returnerte checkout URL-en.
   *
   * client_reference_id settes til userId slik at vi kan knytte
   * checkout.session.completed eventet til riktig bruker i DB.
   *
   * @param {object} options
   * @param {string} options.userId   — Intern bruker-ID (UUID)
   * @param {string} options.email    — Brukerens e-postadresse (forhåndsutfyll)
   * @returns {Promise<object>}       — { sessionId, url }
   */
  async createCheckoutSession({ userId, email }) {
    const session = await this._stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: config.stripe.priceId,
          quantity: 1,
        },
      ],
      // Knytt sesjonen til vår interne bruker-ID
      client_reference_id: userId,
      // Forhåndsutfyll e-post om vi har den
      customer_email: email || undefined,
      // Redirect-URLer etter betaling
      success_url: `${config.stripe.successUrl}?userId=${userId}`,
      cancel_url: config.stripe.cancelUrl,
      // Metadata for sporing
      metadata: {
        userId,
        source: 'claw-orchestrator',
      },
    });

    console.log(`[Stripe] Checkout Session opprettet: ${session.id}`);
    console.log(`[Stripe]   Bruker: ${userId}`);
    console.log(`[Stripe]   URL:    ${session.url}`);

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Verifiserer Stripe webhook-signatur og returnerer Event-objektet.
   *
   * KRITISK: req.body må være rå buffer (express.raw()) —
   * express.json() ødelegger signaturen.
   *
   * @param {Buffer} rawBody    — Rå request body (ikke JSON-parset)
   * @param {string} signature  — Innhold i 'stripe-signature' headeren
   * @returns {object}          — Stripe Event-objekt
   * @throws {Error}            — Hvis signaturen er ugyldig
   */
  constructEvent(rawBody, signature) {
    return this._stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.webhookSecret
    );
  }

  /**
   * Henter et Stripe-abonnement.
   *
   * @param {string} subscriptionId — Stripe subscription ID (sub_...)
   * @returns {Promise<object>}     — Stripe Subscription-objekt
   */
  async getSubscription(subscriptionId) {
    return this._stripe.subscriptions.retrieve(subscriptionId);
  }
}

module.exports = new StripeService();
