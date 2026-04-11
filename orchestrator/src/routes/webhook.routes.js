// ============================================================
// Claw Personal — Webhook Routes
// ============================================================
// Route-handler for betalings-webhooks.
//
// POST /webhook/payment
//   Mottar bekreftelse på at en bruker har betalt.
//   Trigget av betalingsleverandør (f.eks. Stripe/Vipps).
//
// Flyten:
//   1. Valider innkommende data
//   2. Generer intern token
//   3. Lagre userId ↔ token kobling
//   4. Opprett Virtual Key via LiteLLM
//   5. Start NanoClaw-container for brukeren
//   6. Returner status
// ============================================================

const express = require('express');
const tokenService = require('../services/token.service');
const litellmService = require('../services/litellm.service');
const dockerService = require('../services/docker.service');

const router = express.Router();

/**
 * POST /webhook/payment
 *
 * Body (JSON):
 *   {
 *     "userId": "user-001",
 *     "status": "completed"
 *   }
 *
 * Respons (200 OK):
 *   {
 *     "success": true,
 *     "userId": "user-001",
 *     "containerId": "abc123...",
 *     "containerName": "claw-user-user-001",
 *     "containerStatus": "running"
 *   }
 */
router.post('/payment', async (req, res) => {
  try {
    const { userId, status } = req.body;

    // -----------------------------------------------------------
    // 1. Valider innkommende data
    // -----------------------------------------------------------
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Mangler påkrevd felt: userId (streng)',
      });
    }

    if (!status || status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Ugyldig betalingsstatus. Forventet: "completed"',
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Webhook] Betalingsbekreftelse mottatt for bruker: ${userId}`);
    console.log(`${'='.repeat(60)}`);

    // -----------------------------------------------------------
    // 2. Generer intern token og lagre koblingen
    // -----------------------------------------------------------
    const internalToken = tokenService.createAndStoreToken(userId);
    console.log(`[Webhook] Intern token generert for bruker: ${userId}`);

    // -----------------------------------------------------------
    // 3. Opprett Virtual Key via LiteLLM
    // -----------------------------------------------------------
    let virtualKey;
    try {
      const keyResponse = await litellmService.createVirtualKey(userId);
      virtualKey = keyResponse.key;
      console.log(`[Webhook] Virtual Key opprettet for bruker: ${userId}`);
    } catch (err) {
      console.error(`[Webhook] Kunne ikke opprette Virtual Key: ${err.message}`);
      // Fortsett med intern token som fallback for testing
      // I produksjon bør dette feile
      virtualKey = internalToken;
      console.warn(`[Webhook] Bruker intern token som fallback Virtual Key`);
    }

    // -----------------------------------------------------------
    // 4. Start NanoClaw-container for brukeren
    // -----------------------------------------------------------
    const containerInfo = await dockerService.spawnUserContainer(
      userId,
      internalToken,
      virtualKey
    );

    console.log(`[Webhook] Bruker ${userId} er klargjort!`);
    console.log(`[Webhook]   Container: ${containerInfo.containerName}`);
    console.log(`[Webhook]   Status:    ${containerInfo.status}`);
    console.log(`${'='.repeat(60)}\n`);

    // -----------------------------------------------------------
    // 5. Returner suksess
    // -----------------------------------------------------------
    return res.status(200).json({
      success: true,
      userId,
      containerId: containerInfo.containerId,
      containerName: containerInfo.containerName,
      containerStatus: containerInfo.status,
    });

  } catch (err) {
    console.error(`[Webhook] Feil under klargjøring: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: `Klargjøring feilet: ${err.message}`,
    });
  }
});

module.exports = router;
