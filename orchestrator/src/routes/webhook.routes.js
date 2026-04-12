// ============================================================
// Claw Personal — Webhook Routes (Fase 4: PostgreSQL)
// ============================================================
// Route-handler for betalings-webhooks.
//
// POST /webhook/payment
//   Mottar bekreftelse på at en bruker har betalt.
//   Trigget av betalingsleverandør (f.eks. Stripe).
//
// Flyten (oppdatert Fase 4):
//   1. Valider innkommende data
//   2. Opprett bruker i databasen (users-tabellen)
//   3. Generer intern token og lagre i databasen
//   4. Opprett Virtual Key via LiteLLM
//   5. Start NanoClaw-container for brukeren
//   6. Oppdater bruker med container-info
//   7. Returner status
// ============================================================

const express = require('express');
const db = require('../db/pool');
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
 *     "email":  "bruker@eksempel.no",  (valgfritt)
 *     "status": "completed"
 *   }
 *
 * Respons (200 OK):
 *   {
 *     "success": true,
 *     "userId": "<uuid>",
 *     "containerId": "abc123...",
 *     "containerName": "claw-user-<uuid>",
 *     "containerStatus": "running"
 *   }
 */
router.post('/payment', async (req, res) => {
  try {
    const { userId, email, status } = req.body;

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
    // 2. Opprett eller oppdater bruker i databasen
    // -----------------------------------------------------------
    const userResult = await db.query(
      `INSERT INTO users (id, email, license_status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (id) DO UPDATE SET
         license_status = 'active',
         email = COALESCE($2, users.email)
       RETURNING id`,
      [userId, email || null]
    );
    const dbUserId = userResult.rows[0].id;
    console.log(`[Webhook] Bruker opprettet/oppdatert i DB: ${dbUserId}`);

    // -----------------------------------------------------------
    // 3. Generer intern token og lagre i databasen
    // -----------------------------------------------------------
    const internalToken = await tokenService.createAndStoreToken(dbUserId);
    console.log(`[Webhook] Intern token generert for bruker: ${dbUserId}`);

    // -----------------------------------------------------------
    // 4. Opprett Virtual Key via LiteLLM
    // -----------------------------------------------------------
    let virtualKey;
    try {
      const keyResponse = await litellmService.createVirtualKey(dbUserId);
      virtualKey = keyResponse.key;
      console.log(`[Webhook] Virtual Key opprettet for bruker: ${dbUserId}`);
    } catch (err) {
      console.error(`[Webhook] Kunne ikke opprette Virtual Key: ${err.message}`);
      // Fortsett med intern token som fallback for testing
      // I produksjon bør dette feile
      virtualKey = internalToken;
      console.warn(`[Webhook] Bruker intern token som fallback Virtual Key`);
    }

    // -----------------------------------------------------------
    // 5. Start NanoClaw-container for brukeren
    // -----------------------------------------------------------
    const containerInfo = await dockerService.spawnUserContainer(
      dbUserId,
      internalToken,
      virtualKey
    );

    // -----------------------------------------------------------
    // 6. Oppdater bruker med container-info i databasen
    // -----------------------------------------------------------
    await db.query(
      `UPDATE users
       SET container_id = $2, container_name = $3
       WHERE id = $1`,
      [dbUserId, containerInfo.containerId, containerInfo.containerName]
    );

    console.log(`[Webhook] Bruker ${dbUserId} er klargjort!`);
    console.log(`[Webhook]   Container: ${containerInfo.containerName}`);
    console.log(`[Webhook]   Status:    ${containerInfo.status}`);
    console.log(`[Webhook]   DB:        ✅ Bruker + token lagret`);
    console.log(`${'='.repeat(60)}\n`);

    // -----------------------------------------------------------
    // 7. Returner suksess
    // -----------------------------------------------------------
    return res.status(200).json({
      success: true,
      userId: dbUserId,
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
