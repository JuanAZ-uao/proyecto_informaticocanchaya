const pool = require('../config/db');
const Cancha = require('../models/Cancha');

async function listarDisponibles() {
  const { rows } = await pool.query(
    'SELECT * FROM canchas WHERE disponible = true ORDER BY nombre ASC'
  );

  return rows.map(Cancha.aDominio);
}

async function crearMuchas(canchas) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const insertadas = [];
    for (const cancha of canchas) {
      const { rows } = await cliente.query(
        `INSERT INTO canchas (nombre, direccion, disponible)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [cancha.nombre, cancha.direccion, cancha.disponible ?? true]
      );
      insertadas.push(rows[0]);
    }

    await cliente.query('COMMIT');
    return insertadas.map(Cancha.aDominio);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function eliminarTodas() {
  await pool.query('DELETE FROM canchas');
}

async function contar() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM canchas');
  return rows[0].total;
}

module.exports = {
  listarDisponibles,
  crearMuchas,
  eliminarTodas,
  contar,
};
