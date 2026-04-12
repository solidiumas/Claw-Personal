// ============================================================
// Claw Personal — Database Migrasjon
// ============================================================
// Kjører schema.sql mot PostgreSQL for å opprette tabeller.
//
// Idempotent — trygt å kjøre flere ganger. Alle CREATE-
// setninger bruker IF NOT EXISTS.
//
// Kalles automatisk ved oppstart av serveren.
// Kan også kjøres manuelt: node src/db/migrate.js
// ============================================================

const fs = require('fs');
const path = require('path');
const db = require('./pool');

/**
 * Kjører database-migrasjon.
 * Leser schema.sql og utfører den mot databasen.
 *
 * @returns {Promise<void>}
 * @throws {Error} Hvis migrasjonen feiler
 */
async function migrate() {
  console.log('[Migrate] Starter database-migrasjon...');

  try {
    // Les schema-filen
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Kjør schema mot databasen
    await db.query(schema);

    console.log('[Migrate] ✅ Database-migrasjon fullført!');
    console.log('[Migrate]    Tabeller: users, user_tokens, internal_tokens');
  } catch (err) {
    console.error(`[Migrate] ❌ Migrasjon feilet: ${err.message}`);
    throw err;
  }
}

// Tillat kjøring direkte: node src/db/migrate.js
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('[Migrate] Ferdig. Avslutter.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migrate] Avslutter med feil:', err.message);
      process.exit(1);
    });
}

module.exports = migrate;
