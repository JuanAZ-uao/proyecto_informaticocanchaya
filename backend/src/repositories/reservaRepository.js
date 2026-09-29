const pool = require('../config/db');
const Reserva = require('../models/Reserva');

async function listarPorCanchaYFecha(canchaId, fecha) {
  const { rows } = await pool.query(
    `SELECT * FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND estado = 'activa' ORDER BY hora_inicio ASC`,
    [canchaId, fecha]
  );

  return rows.map(Reserva.aDominio);
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`SELECT * FROM reservas WHERE id = $1`, [id]);
  return Reserva.aDominio(rows[0]);
}

async function crear({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [canchaId, usuarioId, fecha, horaInicio, horaFin]
    );

    await cliente.query('COMMIT');
    return Reserva.aDominio(rows[0]);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function cancelar(id, usuarioId) {
  const { rows } = await pool.query(
    `UPDATE reservas
     SET estado = 'cancelada'
     WHERE id = $1 AND usuario_id = $2 AND estado = 'activa'
     RETURNING *`,
    [id, usuarioId]
  );

  return Reserva.aDominio(rows[0]);
}

module.exports = { listarPorCanchaYFecha, obtenerPorId, crear, cancelar };
