// ============================================================
// Claw Personal — PostgreSQL Connection Pool
// ============================================================
// Sentralisert databasetilkobling via node-postgres (pg).
//
// Bruker en connection pool for å håndtere flere samtidige
// forespørsler effektivt. Alle tjenester importerer denne
// modulen for å utføre SQL-spørringer.
//
// Tilkoblingen konfigureres via DATABASE_URL miljøvariabel:
//   postgresql://bruker:passord@host:port/database
// ============================================================

const { Pool } = require('pg');
const config = require('../config');

// -----------------------------------------------------------
// Opprett tilkoblingspool
// -----------------------------------------------------------
const pool = new Pool({
  connectionString: config.database.connectionString,
  max: config.database.maxConnections,
  idleTimeoutMillis: config.database.idleTimeoutMs,
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
});

// Logg tilkoblingshendelser
pool.on('connect', () => {
  console.log('[DB] Ny klient koblet til PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Uventet feil på databaseklient:', err.message);
});

// -----------------------------------------------------------
// Hjelpefunksjoner
// -----------------------------------------------------------

/**
 * Kjør en SQL-spørring med parameterbinding.
 *
 * @param {string} text   - SQL-spørring med $1, $2, ... plassholdere
 * @param {Array}  params - Verdier for plassholderne
 * @returns {Promise<import('pg').QueryResult>}
 *
 * @example
 *   const result = await db.query(
 *     'SELECT * FROM users WHERE id = $1',
 *     ['user-001']
 *   );
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Test databasetilkoblingen.
 * Brukes ved oppstart for å verifisere at DB er tilgjengelig.
 *
 * @returns {Promise<boolean>} true hvis tilkoblingen er OK
 * @throws {Error} Hvis tilkoblingen feiler
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    console.log(`[DB] ✅ Databasetilkobling OK (${result.rows[0].current_time})`);
    return true;
  } catch (err) {
    console.error(`[DB] ❌ Kunne ikke koble til databasen: ${err.message}`);
    throw err;
  }
}

/**
 * Lukk alle tilkoblinger i poolen.
 * Brukes ved kontrollert avslutning av serveren.
 */
async function close() {
  await pool.end();
  console.log('[DB] Alle tilkoblinger lukket.');
}

module.exports = {
  query,
  testConnection,
  close,
  pool,
};
