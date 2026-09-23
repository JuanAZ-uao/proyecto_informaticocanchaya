const pool = require('../config/db');
const Reserva = require('../models/Reserva');

async function listarPorCanchaYFecha(canchaId, fecha) {
  const { rows } = await pool.query(
    `SELECT * FROM reservas WHERE cancha_id = $1 AND fecha = $2 ORDER BY hora_inicio ASC`,
    [canchaId, fecha]
  );

  return rows.map(Reserva.aDominio);
}

async function crear({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
  const { rows } = await pool.query(
    `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [canchaId, usuarioId, fecha, horaInicio, horaFin]
  );

  return Reserva.aDominio(rows[0]);
}

module.exports = { listarPorCanchaYFecha, crear };
