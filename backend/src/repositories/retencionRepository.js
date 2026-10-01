const pool = require('../config/db');
const Retencion = require('../models/Retencion');

// Retiene la franja para el usuario de forma atómica. En la misma transacción:
// limpia una retención vencida de esa franja, libera la retención anterior del
// usuario en la cancha (solo una por usuario y cancha) e inserta la nueva.
// Si otro usuario ya la retiene, el índice único uq_retenciones_franja hace fallar
// el INSERT (código 23505) y no queda ningún cambio a medias.
async function retener({ usuarioId, canchaId, fecha, horaInicio, horaFin, expiresAt }) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    await cliente.query(
      `DELETE FROM retenciones
       WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3 AND expires_at <= now()`,
      [canchaId, fecha, horaInicio]
    );

    const anterior = await cliente.query(
      'DELETE FROM retenciones WHERE usuario_id = $1 AND cancha_id = $2 RETURNING *',
      [usuarioId, canchaId]
    );

    const { rows } = await cliente.query(
      `INSERT INTO retenciones (usuario_id, cancha_id, fecha, hora_inicio, hora_fin, expires_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
       RETURNING *`,
      [usuarioId, canchaId, fecha, horaInicio, horaFin, expiresAt]
    );

    await cliente.query('COMMIT');
    return { retencion: Retencion.aDominio(rows[0]), anterior: Retencion.aDominio(anterior.rows[0]) };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function liberarDeUsuario(usuarioId, canchaId) {
  const { rows } = await pool.query(
    'DELETE FROM retenciones WHERE usuario_id = $1 AND cancha_id = $2 RETURNING *',
    [usuarioId, canchaId]
  );
  return Retencion.aDominio(rows[0]);
}

async function obtenerVigentePorFranja(canchaId, fecha, horaInicio) {
  const { rows } = await pool.query(
    `SELECT * FROM retenciones
     WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3 AND expires_at > now()`,
    [canchaId, fecha, horaInicio]
  );
  return Retencion.aDominio(rows[0]);
}

async function listarVigentesPorCanchaYFecha(canchaId, fecha) {
  const { rows } = await pool.query(
    `SELECT * FROM retenciones
     WHERE cancha_id = $1 AND fecha = $2 AND expires_at > now()
     ORDER BY hora_inicio ASC`,
    [canchaId, fecha]
  );
  return rows.map(Retencion.aDominio);
}

async function extenderDeUsuario(usuarioId, canchaId, expiresAt) {
  await pool.query(
    'UPDATE retenciones SET expires_at = to_timestamp($3 / 1000.0) WHERE usuario_id = $1 AND cancha_id = $2',
    [usuarioId, canchaId, expiresAt]
  );
}

async function eliminarVencidas() {
  const { rows } = await pool.query('DELETE FROM retenciones WHERE expires_at <= now() RETURNING *');
  return rows.map(Retencion.aDominio);
}

module.exports = {
  retener,
  liberarDeUsuario,
  obtenerVigentePorFranja,
  listarVigentesPorCanchaYFecha,
  extenderDeUsuario,
  eliminarVencidas,
};
