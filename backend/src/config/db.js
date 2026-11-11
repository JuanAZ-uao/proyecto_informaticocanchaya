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

// Al arrancar, la base puede tardar unos segundos en aceptar conexiones (PostgreSQL recién creado o reiniciándose,
// o un despliegue en Railway mientras el servicio de la base despierta): se reintenta antes de rendirse.
const INTENTOS_CONEXION = Number(process.env.DB_CONEXION_INTENTOS || 10);
const ESPERA_ENTRE_INTENTOS_MS = Number(process.env.DB_CONEXION_ESPERA_MS || 2000);

async function conectarConReintentos() {
  for (let intento = 1; ; intento += 1) {
    try {
      await pool.query('SELECT 1');
      console.log('[DB] Conectado a PostgreSQL');
      return;
    } catch (error) {
      console.error(`[DB] Error al conectar a PostgreSQL (intento ${intento}/${INTENTOS_CONEXION}):`, error.message);
      if (intento >= INTENTOS_CONEXION) process.exit(1);
      await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_INTENTOS_MS));
    }
  }
}

// Quien necesite la base al arrancar (migración, restauración de sesiones) espera a esta promesa.
pool.listo = conectarConReintentos();

module.exports = pool;
