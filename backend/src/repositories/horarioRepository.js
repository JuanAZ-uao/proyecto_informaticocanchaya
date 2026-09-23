const pool = require('../config/db');
const HorarioDisponible = require('../models/HorarioDisponible');

async function listarPorCancha(canchaId) {
  const { rows } = await pool.query(
    `SELECT * FROM horarios_disponibles
     WHERE cancha_id = $1
     ORDER BY dia_semana ASC, hora_inicio ASC`,
    [canchaId]
  );

  return rows.map(HorarioDisponible.aDominio);
}

async function crearMuchos(horarios) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const insertados = [];
    for (const horario of horarios) {
      const { rows } = await cliente.query(
        `INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [horario.canchaId, horario.diaSemana, horario.horaInicio, horario.horaFin]
      );
      insertados.push(rows[0]);
    }

    await cliente.query('COMMIT');
    return insertados.map(HorarioDisponible.aDominio);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = {
  listarPorCancha,
  crearMuchos,
};
