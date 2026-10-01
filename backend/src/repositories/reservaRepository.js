const pool = require('../config/db');
const Reserva = require('../models/Reserva');

const ESTADO_CONFIRMADA = 'confirmada';

async function listarPorCanchaYFecha(canchaId, fecha) {
  const { rows } = await pool.query(
    `SELECT * FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND estado = $3 ORDER BY hora_inicio ASC`,
    [canchaId, fecha, ESTADO_CONFIRMADA]
  );

  return rows.map(Reserva.aDominio);
}

async function existeConfirmada(canchaId, fecha, horaInicio) {
  const { rows } = await pool.query(
    `SELECT 1 FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3 AND estado = $4 LIMIT 1`,
    [canchaId, fecha, horaInicio, ESTADO_CONFIRMADA]
  );
  return rows.length > 0;
}

async function listarPorUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT r.*, c.nombre AS cancha_nombre, c.direccion AS cancha_direccion
     FROM reservas r
     JOIN canchas c ON c.id = r.cancha_id
     WHERE r.usuario_id = $1
     ORDER BY r.fecha DESC, r.hora_inicio DESC`,
    [usuarioId]
  );

  return rows.map((fila) => ({
    ...Reserva.aDominio(fila),
    cancha: { id: fila.cancha_id, nombre: fila.cancha_nombre, direccion: fila.cancha_direccion },
  }));
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
      `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [canchaId, usuarioId, fecha, horaInicio, horaFin, ESTADO_CONFIRMADA]
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
     WHERE id = $1 AND usuario_id = $2 AND estado = $3
     RETURNING *`,
    [id, usuarioId, ESTADO_CONFIRMADA]
  );

  return Reserva.aDominio(rows[0]);
}

module.exports = { listarPorCanchaYFecha, existeConfirmada, listarPorUsuario, obtenerPorId, crear, cancelar };
