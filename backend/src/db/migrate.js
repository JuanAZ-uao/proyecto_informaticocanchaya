const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function migrar() {
  const rutaSchema = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(rutaSchema, 'utf8');

  await pool.query(sql);
  console.log('[MIGRATE] Esquema aplicado correctamente');

  await pool.end();
  process.exit(0);
}

migrar().catch((error) => {
  console.error('[MIGRATE] Error al aplicar el esquema:', error.message);
  process.exit(1);
});
