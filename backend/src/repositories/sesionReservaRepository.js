const pool = require('../config/db');

function aDominio(fila) {
  if (!fila) return null;

  return {
    usuarioId: fila.usuario_id,
    canchaId: fila.cancha_id,
    expiresAt: new Date(fila.expires_at).getTime(),
    estado: fila.estado,
  };
}

async function obtener(usuarioId, canchaId) {
  const { rows } = await pool.query(
    'SELECT * FROM sesiones_reserva WHERE usuario_id = $1 AND cancha_id = $2',
    [usuarioId, canchaId]
  );
  return aDominio(rows[0]);
}

async function guardar({ usuarioId, canchaId, expiresAt, estado }) {
  const { rows } = await pool.query(
    `INSERT INTO sesiones_reserva (usuario_id, cancha_id, expires_at, estado)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), $4)
     ON CONFLICT (usuario_id, cancha_id)
     DO UPDATE SET expires_at = EXCLUDED.expires_at, estado = EXCLUDED.estado, updated_at = now()
     RETURNING *`,
    [usuarioId, canchaId, expiresAt, estado]
  );
  return aDominio(rows[0]);
}

async function actualizarEstado(usuarioId, canchaId, estado) {
  await pool.query(
    'UPDATE sesiones_reserva SET estado = $3, updated_at = now() WHERE usuario_id = $1 AND cancha_id = $2',
    [usuarioId, canchaId, estado]
  );
}

async function eliminar(usuarioId, canchaId) {
  await pool.query('DELETE FROM sesiones_reserva WHERE usuario_id = $1 AND cancha_id = $2', [
    usuarioId,
    canchaId,
  ]);
}

async function listarActivasVigentes() {
  const { rows } = await pool.query(
    `SELECT * FROM sesiones_reserva WHERE estado = 'activo' AND expires_at > now()`
  );
  return rows.map(aDominio);
}

async function eliminarVencidas() {
  await pool.query(`DELETE FROM sesiones_reserva WHERE expires_at <= now() AND estado = 'activo'`);
}

module.exports = { obtener, guardar, actualizarEstado, eliminar, listarActivasVigentes, eliminarVencidas };
