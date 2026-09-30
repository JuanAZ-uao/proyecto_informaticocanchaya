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

  if (filtros.fecha) {
    valores.push(filtros.fecha);
    const posicionFecha = valores.length;
    condiciones.push(`EXISTS (
      SELECT 1 FROM horarios_disponibles h
      WHERE h.cancha_id = canchas.id
        AND h.dia_semana = EXTRACT(DOW FROM $${posicionFecha}::date)
        AND (
          SELECT COUNT(*) FROM reservas r
          WHERE r.cancha_id = canchas.id AND r.fecha = $${posicionFecha}::date
        ) < FLOOR(EXTRACT(EPOCH FROM (h.hora_fin - h.hora_inicio)) / 3600)
    )`);
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
        `INSERT INTO canchas
           (nombre, direccion, zona, disponible, costo_hora, imagen_url, imagen_credito, descripcion, tipo, servicios)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          cancha.nombre,
          cancha.direccion,
          cancha.zona ?? 'Sin zona',
          cancha.disponible ?? true,
          cancha.costoHora ?? 0,
          cancha.imagenUrl ?? null,
          cancha.imagenCredito ?? null,
          cancha.descripcion ?? null,
          cancha.tipo ?? null,
          cancha.servicios ?? [],
        ]
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

async function actualizarPresentacionPorNombre(nombre, { imagenUrl, imagenCredito, descripcion, tipo, servicios }) {
  const { rowCount } = await pool.query(
    `UPDATE canchas
     SET imagen_url = $1, imagen_credito = $2, descripcion = $3, tipo = $4, servicios = $5, updated_at = now()
     WHERE nombre = $6`,
    [imagenUrl, imagenCredito, descripcion, tipo, servicios, nombre]
  );
  return rowCount;
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
  actualizarPresentacionPorNombre,
  eliminarTodas,
  contar,
};
