// ============================================================
// Claw Personal — Webhook Routes (Fase 5: Stripe SDK)
// ============================================================
// Sikker Stripe webhook-handler med:
//
//   ✅ Signaturverifisering (stripe.webhooks.constructEvent)
//   ✅ Ack-First / Zero-Delay (200 OK umiddelbart)
//   ✅ Idempotency via processed_events-tabellen i PostgreSQL
//   ✅ Asynkron provisjonering via setImmediate()
//
// Håndterte events:
//   - checkout.session.completed     → Provisjonér ny bruker
//   - invoice.paid                   → Forleng aktivt abonnement
//   - invoice.payment_failed         → Flagg bruker for oppfølging
//   - customer.subscription.deleted  → Deaktiver og stopp container
//   - customer.subscription.updated  → Oppdater lisensstatus
//
// KRITISK: Denne ruten bruker express.raw() middleware.
// Den MÅ registreres i server.js FØR express.json() globalt.
// ============================================================

const express = require('express');
const db = require('../db/pool');
const stripeService = require('../services/stripe.service');
const tokenService = require('../services/token.service');
const litellmService = require('../services/litellm.service');
const dockerService = require('../services/docker.service');

const router = express.Router();

// ============================================================
// POST /webhook/payment
// ============================================================
// Merk: express.raw() er påkrevd her. Det er registrert i
// server.js spesifikt for denne ruten, FØR express.json().
// ============================================================
router.post('/payment', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  // -----------------------------------------------------------
  // 1. Verifiser Stripe-signatur (kryptografisk, <5ms)
  // -----------------------------------------------------------
  let event;
  try {
    event = stripeService.constructEvent(req.body, signature);
  } catch (err) {
    console.error(`[Webhook] ❌ Signaturverifisering feilet: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // -----------------------------------------------------------
  // 2. Sjekk idempotency — har vi sett dette event.id før?
  //    Dette forhindrer dobbelt-provisjonering ved Stripe retry.
  // -----------------------------------------------------------
  try {
    const exists = await db.query(
      'SELECT 1 FROM processed_events WHERE stripe_event_id = $1',
      [event.id]
    );
    if (exists.rows.length > 0) {
      console.log(`[Webhook] ℹ️  Duplikat event ignorert: ${event.id} (${event.type})`);
      return res.json({ received: true, duplicate: true });
    }

    // Merk event som prosessert umiddelbart
    await db.query(
      'INSERT INTO processed_events (stripe_event_id, event_type) VALUES ($1, $2)',
      [event.id, event.type]
    );
  } catch (err) {
    // Unik-constraint brudd = race condition, dette er et duplikat
    if (err.code === '23505') {
      console.log(`[Webhook] ℹ️  Race condition duplikat: ${event.id}`);
      return res.json({ received: true, duplicate: true });
    }
    console.error(`[Webhook] DB-feil ved idempotency-sjekk: ${err.message}`);
    return res.status(500).json({ error: 'Intern feil' });
  }

  // -----------------------------------------------------------
  // 3. ACK-FIRST: Returner 200 OK umiddelbart!
  //    Stripe er fornøyd. Provisjonering skjer i bakgrunnen.
  // -----------------------------------------------------------
  res.json({ received: true });

  // -----------------------------------------------------------
  // 4. Behandle eventet asynkront (Zero-Delay mønster)
  // -----------------------------------------------------------
  setImmediate(() => handleStripeEvent(event).catch((err) => {
    console.error(`[Webhook] ❌ Feil under asynkron behandling av ${event.type}: ${err.message}`);
    console.error(err.stack);
  }));
});

// ============================================================
// Asynkron event-handler
// ============================================================

async function handleStripeEvent(event) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Webhook] Behandler event: ${event.type}`);
  console.log(`[Webhook]   Event ID: ${event.id}`);
  console.log(`${'='.repeat(60)}`);

  switch (event.type) {

    // ---------------------------------------------------------
    // checkout.session.completed
    // ---------------------------------------------------------
    // En bruker har fullført betalingen. Dette er det primære
    // triggerpunktet for "Zero Delay" provisjonering.
    //
    // Flyten:
    //   1. Hent userId fra client_reference_id (satt av oss)
    //   2. Lagre Stripe customer/subscription ID-er i DB
    //   3. Sett license_status til 'active'
    //   4. Generer intern token
    //   5. Opprett LiteLLM Virtual Key
    //   6. Spawn NanoClaw Docker-container
    //   7. Oppdater container-info i DB
    // ---------------------------------------------------------
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;

      if (!userId) {
        console.error(`[Webhook] ❌ checkout.session.completed mangler client_reference_id!`);
        return;
      }

      console.log(`[Webhook] ✅ Betaling fullført for bruker: ${userId}`);
      console.log(`[Webhook]   Stripe Customer: ${session.customer}`);
      console.log(`[Webhook]   Stripe Subscription: ${session.subscription}`);

      // Oppdater bruker i DB med Stripe-IDer og aktiv status
      await db.query(
        `UPDATE users
         SET license_status        = 'active',
             stripe_customer_id     = $2,
             stripe_subscription_id = $3
         WHERE id = $1`,
        [userId, session.customer, session.subscription]
      );
      console.log(`[Webhook]   DB: license_status → active`);

      // Provisjoner brukeren
      await provisionUser(userId);
      break;
    }

    // ---------------------------------------------------------
    // invoice.paid
    // ---------------------------------------------------------
    // Månedlig abonnementsfornyelse gikk gjennom.
    // Sikrer at brukeren forblir aktiv.
    // ---------------------------------------------------------
    case 'invoice.paid': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      const result = await db.query(
        `UPDATE users
         SET license_status = 'active'
         WHERE stripe_customer_id = $1
         RETURNING id, email`,
        [customerId]
      );

      if (result.rows.length > 0) {
        const { id, email } = result.rows[0];
        console.log(`[Webhook] ✅ invoice.paid: Abonnement fornyet for ${email || id}`);
      } else {
        console.warn(`[Webhook] ⚠️  invoice.paid: Ingen bruker funnet for customer ${customerId}`);
      }
      break;
    }

    // ---------------------------------------------------------
    // invoice.payment_failed
    // ---------------------------------------------------------
    // Betalingen feilet (utløpt kort, utilstrekkelige midler etc.)
    // Setter status til 'expired' — gir 7 dagers grace period
    // i produksjon ved å sjekke created_at på subscription.
    // ---------------------------------------------------------
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      const result = await db.query(
        `UPDATE users
         SET license_status = 'expired'
         WHERE stripe_customer_id = $1
         RETURNING id, email`,
        [customerId]
      );

      if (result.rows.length > 0) {
        const { id, email } = result.rows[0];
        console.warn(`[Webhook] ⚠️  invoice.payment_failed: Betaling feilet for ${email || id}`);
        console.warn(`[Webhook]    Status → expired. Bruker bør varsles.`);
        // PRODUKSJON: Send e-post til brukeren her
        // await emailService.sendPaymentFailedEmail(email);
      }
      break;
    }

    // ---------------------------------------------------------
    // customer.subscription.deleted
    // ---------------------------------------------------------
    // Brukeren har sagt opp abonnementet, eller det er slettet
    // etter for mange mislykkede betalingsforsøk.
    // Container stoppes og fratas ressurser.
    // ---------------------------------------------------------
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const result = await db.query(
        `UPDATE users
         SET license_status = 'revoked'
         WHERE stripe_customer_id = $1
         RETURNING id, email, container_name`,
        [customerId]
      );

      if (result.rows.length > 0) {
        const { id, email, container_name } = result.rows[0];
        console.log(`[Webhook] 🛑 Abonnement slettet for ${email || id}`);
        console.log(`[Webhook]    Status → revoked`);

        // Stopp brukerens container
        if (container_name) {
          try {
            await dockerService._removeExistingContainer(container_name);
            // Nullstill container-info i DB
            await db.query(
              `UPDATE users SET container_id = NULL, container_name = NULL WHERE id = $1`,
              [id]
            );
            console.log(`[Webhook]    Container '${container_name}' stoppet og fjernet.`);
          } catch (err) {
            console.warn(`[Webhook]    Kunne ikke stoppe container: ${err.message}`);
          }
        }
      }
      break;
    }

    // ---------------------------------------------------------
    // customer.subscription.updated
    // ---------------------------------------------------------
    // Abonnementet er endret (oppgradering, nedgradering,
    // reakivert etter feil osv.)
    // ---------------------------------------------------------
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const stripeStatus = subscription.status;

      // Map Stripe-status til vår interne license_status
      const licenseStatus = stripeStatusToLicenseStatus(stripeStatus);

      const result = await db.query(
        `UPDATE users
         SET license_status        = $2,
             stripe_subscription_id = $3
         WHERE stripe_customer_id = $1
         RETURNING id, email`,
        [customerId, licenseStatus, subscription.id]
      );

      if (result.rows.length > 0) {
        const { email, id } = result.rows[0];
        console.log(`[Webhook] 🔄 Abonnement oppdatert for ${email || id}`);
        console.log(`[Webhook]    Stripe status: ${stripeStatus} → license_status: ${licenseStatus}`);
      }
      break;
    }

    default:
      console.log(`[Webhook] ℹ️  Ubehandlet event ignorert: ${event.type}`);
  }

  console.log(`[Webhook] ✅ Event ferdigbehandlet: ${event.type}\n`);
}

// ============================================================
// Provisjonering av ny bruker
// ============================================================
// Delt av checkout.session.completed og potensielle manuelle
// provisjoneringer. Genererer token, Virtual Key, starter container.
// ============================================================

async function provisionUser(userId) {
  console.log(`[Provision] Starter provisjonering for bruker: ${userId}`);

  // 1. Generer intern token og lagre i databasen
  const internalToken = await tokenService.createAndStoreToken(userId);
  console.log(`[Provision]   Intern token generert`);

  // 2. Opprett Virtual Key via LiteLLM
  let virtualKey;
  try {
    const keyResponse = await litellmService.createVirtualKey(userId);
    virtualKey = keyResponse.key;
    console.log(`[Provision]   LiteLLM Virtual Key opprettet`);
  } catch (err) {
    console.error(`[Provision]   ❌ Virtual Key feilet: ${err.message}`);
    // Fortsett med intern token som fallback
    virtualKey = internalToken;
    console.warn(`[Provision]   ⚠️  Bruker intern token som fallback`);
  }

  // 3. Spawn NanoClaw Docker-container
  const containerInfo = await dockerService.spawnUserContainer(
    userId,
    internalToken,
    virtualKey
  );
  console.log(`[Provision]   Container: ${containerInfo.containerName} (${containerInfo.status})`);

  // 4. Lagre container-info tilbake til brukeren i DB
  await db.query(
    `UPDATE users
     SET container_id = $2, container_name = $3
     WHERE id = $1`,
    [userId, containerInfo.containerId, containerInfo.containerName]
  );

  console.log(`[Provision] ✅ Bruker ${userId} er fullt provisionert!`);
}

// ============================================================
// Hjelpefunksjoner
// ============================================================

/**
 * Mapper Stripe subscription status til intern license_status.
 * @param {string} stripeStatus — f.eks. 'active', 'past_due', 'canceled'
 * @returns {string}            — 'active' | 'expired' | 'revoked' | 'pending'
 */
function stripeStatusToLicenseStatus(stripeStatus) {
  const mapping = {
    active:             'active',
    trialing:           'active',
    past_due:           'expired',
    unpaid:             'expired',
    canceled:           'revoked',
    incomplete:         'pending',
    incomplete_expired: 'revoked',
    paused:             'expired',
  };
  return mapping[stripeStatus] || 'pending';
}

module.exports = router;
