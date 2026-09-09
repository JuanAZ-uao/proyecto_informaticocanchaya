const pool = require('../config/db');
const PasswordResetToken = require('../models/PasswordResetToken');

async function crear({ usuario, tokenHash, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO password_reset_tokens (usuario_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [usuario, tokenHash, expiresAt]
  );

  return PasswordResetToken.aDominio(rows[0]);
}

async function buscarValidoPorHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );

  return PasswordResetToken.aDominio(rows[0]);
}

async function marcarUsado(id) {
  await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [id]);
}

async function invalidarPendientesDeUsuario(usuarioId) {
  await pool.query(
    'UPDATE password_reset_tokens SET used_at = now() WHERE usuario_id = $1 AND used_at IS NULL',
    [usuarioId]
  );
}

module.exports = {
  crear,
  buscarValidoPorHash,
  marcarUsado,
  invalidarPendientesDeUsuario,
};
