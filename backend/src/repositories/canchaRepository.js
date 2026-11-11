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

// Nombres (de la lista dada) que ya existen: el seed de canchas adicionales los usa para no duplicar.
async function listarNombres(nombres) {
  const { rows } = await pool.query('SELECT nombre FROM canchas WHERE nombre = ANY($1)', [nombres]);
  return rows.map((fila) => fila.nombre);
}

// Canchas de la lista que todavía no tienen ningún horario de atención.
async function listarSinHorarioPorNombres(nombres) {
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre FROM canchas c
     WHERE c.nombre = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM horarios_disponibles h WHERE h.cancha_id = c.id)`,
    [nombres]
  );
  return rows;
}

async function contar() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM canchas');
  return rows[0].total;
}

// US-15: gestión de canchas por un administrador.
const RESERVAS_FUTURAS = `(
  SELECT COUNT(*) FROM reservas r
  WHERE r.cancha_id = c.id AND r.estado = 'confirmada' AND (r.fecha + r.hora_fin) >= (now() AT TIME ZONE 'America/Bogota')
)::int`;

async function listarTodasParaAdmin() {
  const { rows } = await pool.query(
    `SELECT c.*, ${RESERVAS_FUTURAS} AS reservas_futuras FROM canchas c ORDER BY c.disponible DESC, c.nombre ASC`
  );
  return rows.map(Cancha.aAdmin);
}

async function obtenerParaAdmin(id) {
  const { rows } = await pool.query(`SELECT c.*, ${RESERVAS_FUTURAS} AS reservas_futuras FROM canchas c WHERE c.id = $1`, [id]);
  return Cancha.aAdmin(rows[0]);
}

async function insertarHorarios(cliente, canchaId, horarios) {
  for (const horario of horarios) {
    await cliente.query(
      `INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4)`,
      [canchaId, horario.diaSemana, horario.horaInicio, horario.horaFin]
    );
  }
}

async function crearConHorarios(datos, horarios) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO canchas (nombre, direccion, zona, disponible, costo_hora, descripcion, tipo, servicios)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7)
       RETURNING *`,
      [datos.nombre, datos.direccion, datos.zona ?? 'Sin zona', datos.costoHora, datos.descripcion ?? null, datos.tipo ?? null, datos.servicios ?? []]
    );
    await insertarHorarios(cliente, rows[0].id, horarios);
    await cliente.query('COMMIT');
    return Cancha.aDominio(rows[0]);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// Reemplaza los datos y los horarios de la cancha. Las reservas ya confirmadas no se tocan.
async function actualizarConHorarios(id, datos, horarios) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `UPDATE canchas
       SET nombre = $2, direccion = $3, zona = $4, costo_hora = $5, descripcion = $6, tipo = $7, servicios = $8, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, datos.nombre, datos.direccion, datos.zona ?? 'Sin zona', datos.costoHora, datos.descripcion ?? null, datos.tipo ?? null, datos.servicios ?? []]
    );

    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      return null;
    }

    await cliente.query('DELETE FROM horarios_disponibles WHERE cancha_id = $1', [id]);
    await insertarHorarios(cliente, id, horarios);
    await cliente.query('COMMIT');
    return Cancha.aDominio(rows[0]);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function cambiarDisponibilidad(id, disponible) {
  const { rows } = await pool.query('UPDATE canchas SET disponible = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, disponible]);
  return Cancha.aDominio(rows[0]);
}

module.exports = {
  listarTodasParaAdmin,
  obtenerParaAdmin,
  crearConHorarios,
  actualizarConHorarios,
  cambiarDisponibilidad,
  listarDisponibles,
  obtenerPorId,
  crearMuchas,
  actualizarPresentacionPorNombre,
  eliminarTodas,
  listarNombres,
  listarSinHorarioPorNombres,
  contar,
};
