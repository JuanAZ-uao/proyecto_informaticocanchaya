const pool = require('../config/db');
const Cancha = require('../models/Cancha');

const DURACION_BLOQUE_MIN = 60;

function horaAMinutos(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

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

  if (filtros.hora) {
    // El bloque pedido es [hora, hora + 1h): debe caber completo dentro de un horario de la cancha.
    const inicioBloque = horaAMinutos(filtros.hora);
    const finBloque = inicioBloque + DURACION_BLOQUE_MIN;

    valores.push(inicioBloque);
    const posicionInicio = valores.length;
    valores.push(finBloque);
    const posicionFin = valores.length;

    let filtroDia = '';
    if (filtros.fecha) {
      valores.push(filtros.fecha);
      filtroDia = `AND h.dia_semana = EXTRACT(DOW FROM $${valores.length}::date)`;
    }

    condiciones.push(`EXISTS (
      SELECT 1 FROM horarios_disponibles h
      WHERE h.cancha_id = canchas.id
        ${filtroDia}
        AND EXTRACT(EPOCH FROM h.hora_inicio) / 60 <= $${posicionInicio}
        AND EXTRACT(EPOCH FROM h.hora_fin) / 60 >= $${posicionFin}
    )`);

    // Con fecha + hora también se descartan las canchas cuyo bloque ya está reservado ese día.
    if (filtros.fecha) {
      const posicionFechaReserva = valores.length;
      condiciones.push(`NOT EXISTS (
        SELECT 1 FROM reservas r
        WHERE r.cancha_id = canchas.id
          AND r.fecha = $${posicionFechaReserva}::date
          AND EXTRACT(EPOCH FROM r.hora_inicio) / 60 < $${posicionFin}
          AND EXTRACT(EPOCH FROM r.hora_fin) / 60 > $${posicionInicio}
      )`);
    }
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
