const pool = require('../config/db');
const MetodoPago = require('../models/MetodoPago');

async function crear({ usuarioId, token, marca, ultimos4, titular, vencimientoMes, vencimientoAnio }) {
  const { rows } = await pool.query(
    `INSERT INTO metodos_pago (usuario_id, token, marca, ultimos4, titular, vencimiento_mes, vencimiento_anio)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [usuarioId, token, marca, ultimos4, titular, vencimientoMes, vencimientoAnio]
  );

  return MetodoPago.aDominio(rows[0]);
}

async function listarPorUsuario(usuarioId) {
  const { rows } = await pool.query('SELECT * FROM metodos_pago WHERE usuario_id = $1 ORDER BY created_at ASC', [usuarioId]);
  return rows.map(MetodoPago.aDominio);
}

// El filtro por usuario garantiza que nadie use ni vea la tarjeta de otro.
async function obtenerDeUsuario(id, usuarioId) {
  const { rows } = await pool.query('SELECT * FROM metodos_pago WHERE id = $1 AND usuario_id = $2', [id, usuarioId]);
  return MetodoPago.aDominio(rows[0]);
}

async function eliminar(id, usuarioId) {
  const { rows } = await pool.query('DELETE FROM metodos_pago WHERE id = $1 AND usuario_id = $2 RETURNING *', [id, usuarioId]);
  return MetodoPago.aDominio(rows[0]);
}

async function contarPorUsuario(usuarioId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM metodos_pago WHERE usuario_id = $1', [usuarioId]);
  return rows[0].total;
}

module.exports = { crear, listarPorUsuario, obtenerDeUsuario, eliminar, contarPorUsuario };
