const { Pool } = require('pg');
const env = require('./env');

const requiereSsl = /sslmode=require|neon\.tech|supabase\.co|render\.com|railway\.app/.test(env.databaseUrl);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: requiereSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (error) => {
  console.error('[DB] Error inesperado en el pool de PostgreSQL:', error.message);
});

pool
  .query('SELECT 1')
  .then(() => console.log('[DB] Conectado a PostgreSQL'))
  .catch((error) => {
    console.error('[DB] Error al conectar a PostgreSQL:', error.message);
    process.exit(1);
  });

module.exports = pool;
