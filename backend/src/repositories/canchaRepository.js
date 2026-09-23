const pool = require('../config/db');
const Cancha = require('../models/Cancha');

async function listarDisponibles(filtros = {}) {
  const condiciones = ['disponible = true'];
  const valores = [];

  if (filtros.zona) {
    valores.push(`%${filtros.zona}%`);
    condiciones.push(`zona ILIKE $${valores.length}`);
  }

  if (filtros.precioMin !== null && filtros.precioMin !== undefined) {
    valores.push(filtros.precioMin);
    condiciones.push(`costo_hora >= $${valores.length}`);
  }

  if (filtros.precioMax !== null && filtros.precioMax !== undefined) {
    valores.push(filtros.precioMax);
    condiciones.push(`costo_hora <= $${valores.length}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM canchas WHERE ${condiciones.join(' AND ')} ORDER BY nombre ASC`,
    valores
  );

  return rows.map(Cancha.aDominio);
}

async function obtenerPorId(id) {
  const { rows } = await pool.query('SELECT * FROM canchas WHERE id = $1', [id]);
  return Cancha.aDominio(rows[0]);
}

async function crearMuchas(canchas) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const insertadas = [];
    for (const cancha of canchas) {
      const { rows } = await cliente.query(
        `INSERT INTO canchas (nombre, direccion, zona, disponible, costo_hora)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [cancha.nombre, cancha.direccion, cancha.zona ?? 'Sin zona', cancha.disponible ?? true, cancha.costoHora ?? 0]
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
  obtenerPorId,
  crearMuchas,
  eliminarTodas,
  contar,
};
