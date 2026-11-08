const pool = require('../config/db');

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    nuevoCorreo: fila.nuevo_correo,
    expiresAt: fila.expires_at,
    usedAt: fila.used_at,
  };
}

async function crear({ usuarioId, nuevoCorreo, tokenHash, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO cambios_correo (usuario_id, nuevo_correo, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [usuarioId, nuevoCorreo, tokenHash, expiresAt]
  );

  return aDominio(rows[0]);
}

async function buscarValidoPorHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM cambios_correo
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );

  return aDominio(rows[0]);
}

async function buscarPendienteDeUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT * FROM cambios_correo
     WHERE usuario_id = $1 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [usuarioId]
  );

  return aDominio(rows[0]);
}

async function marcarUsado(id) {
  await pool.query('UPDATE cambios_correo SET used_at = now() WHERE id = $1', [id]);
}

// Una solicitud nueva reemplaza a las anteriores del mismo usuario.
async function invalidarPendientesDeUsuario(usuarioId) {
  await pool.query('UPDATE cambios_correo SET used_at = now() WHERE usuario_id = $1 AND used_at IS NULL', [usuarioId]);
}

module.exports = { crear, buscarValidoPorHash, buscarPendienteDeUsuario, marcarUsado, invalidarPendientesDeUsuario };
