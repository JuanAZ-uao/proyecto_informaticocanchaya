// US-16: convierte en administrador a un usuario ya registrado.
// Uso: npm run admin:promover -- correo@dominio.com
const pool = require('../config/db');
const { ROL_ADMINISTRADOR } = require('../models/Usuario');

async function promover() {
  const correo = (process.argv[2] || '').toLowerCase().trim();
  if (!correo) {
    throw new Error('Indica el correo del usuario: npm run admin:promover -- correo@dominio.com');
  }

  const { rowCount } = await pool.query(
    'UPDATE usuarios SET rol = $1, updated_at = now() WHERE correo = $2',
    [ROL_ADMINISTRADOR, correo]
  );

  if (rowCount === 0) {
    throw new Error(`No existe un usuario registrado con el correo ${correo}`);
  }

  console.log(`[ADMIN] ${correo} ahora es administrador`);
  await pool.end();
}

promover().catch(async (error) => {
  console.error('[ADMIN]', error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
