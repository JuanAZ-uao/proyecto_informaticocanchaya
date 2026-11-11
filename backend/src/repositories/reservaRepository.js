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

async function listarTodasPorUsuario(usuarioId) {
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

// US-13: historial paginado. Una reserva confirmada cuyo horario ya terminó (hora de Colombia)
// se muestra como "completada"; "proximas" son las que aún no terminan y "pasadas" las que sí.
const FIN_RESERVA = `(r.fecha + r.hora_fin)`;
const AHORA_COLOMBIA = `(now() AT TIME ZONE 'America/Bogota')`;
const ESTADO_VISIBLE = `CASE WHEN r.estado = 'confirmada' AND ${FIN_RESERVA} < ${AHORA_COLOMBIA} THEN 'completada' ELSE r.estado END`;

async function listarPorUsuario({ usuarioId, periodo = 'proximas', estado = null, limite = 10, offset = 0, minutosMinimosCancelacion = 120 }) {
  const condiciones = ['r.usuario_id = $1', periodo === 'pasadas' ? `${FIN_RESERVA} < ${AHORA_COLOMBIA}` : `${FIN_RESERVA} >= ${AHORA_COLOMBIA}`];
  const valores = [usuarioId];

  if (estado) {
    valores.push(estado);
    condiciones.push(`(${ESTADO_VISIBLE}) = $${valores.length}`);
  }

  const donde = condiciones.join(' AND ');
  const orden = periodo === 'pasadas' ? 'DESC' : 'ASC';

  const [{ rows }, { rows: conteo }] = await Promise.all([
    pool.query(
      `SELECT r.id, r.cancha_id, r.created_at, r.hora_inicio, r.hora_fin, r.fecha,
              c.nombre AS cancha_nombre, c.direccion AS cancha_direccion,
              to_char(r.fecha, 'YYYY-MM-DD') AS fecha_texto,
              to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio_texto,
              to_char(r.hora_fin, 'HH24:MI') AS hora_fin_texto,
              ${ESTADO_VISIBLE} AS estado_visible,
              (r.estado = 'confirmada' AND (r.fecha + r.hora_inicio) >= ${AHORA_COLOMBIA} + make_interval(mins => $${valores.length + 3}::int)) AS puede_cancelar,
              p.estado AS pago_estado, p.monto AS pago_monto, p.moneda AS pago_moneda,
              p.marca AS pago_marca, p.ultimos4 AS pago_ultimos4,
              ca.motivo AS motivo_cancelacion
       FROM reservas r
       JOIN canchas c ON c.id = r.cancha_id
       LEFT JOIN pagos p ON p.reserva_id = r.id
       LEFT JOIN cancelaciones_administrativas ca ON ca.reserva_id = r.id
       WHERE ${donde}
       ORDER BY r.fecha ${orden}, r.hora_inicio ${orden}
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limite, offset, minutosMinimosCancelacion]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM reservas r WHERE ${donde}`, valores),
  ]);

  return { reservas: rows.map(Reserva.aHistorial), total: conteo[0].total };
}

// US-12: el mismo usuario no puede tener dos reservas confirmadas que se solapen en
// el tiempo, aunque sean en canchas distintas (hora_inicio < finNueva Y hora_fin > inicioNueva).
async function existeSolapadaDeUsuario(usuarioId, fecha, horaInicio, horaFin) {
  const { rows } = await pool.query(
    `SELECT 1 FROM reservas
     WHERE usuario_id = $1 AND fecha = $2 AND estado = $5
       AND hora_inicio < $4 AND hora_fin > $3
     LIMIT 1`,
    [usuarioId, fecha, horaInicio, horaFin, ESTADO_CONFIRMADA]
  );
  return rows.length > 0;
}

// "Activas" = confirmadas cuyo horario aún no terminó. Las ya jugadas (que el historial muestra
// como "completada") no cuentan para el límite máximo de reservas por usuario.
async function contarActivasPorUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM reservas r
     WHERE r.usuario_id = $1 AND r.estado = $2 AND ${FIN_RESERVA} >= ${AHORA_COLOMBIA}`,
    [usuarioId, ESTADO_CONFIRMADA]
  );
  return rows[0].total;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`SELECT * FROM reservas WHERE id = $1`, [id]);
  return Reserva.aDominio(rows[0]);
}

// enTransaccion(cliente, reserva) corre después del INSERT y antes del COMMIT (por ejemplo, el cobro del
// pago): si falla, la reserva no se guarda. Puede devolver una función que deshace su efecto externo si el
// COMMIT falla después.
async function crearUnaVez({ canchaId, usuarioId, fecha, horaInicio, horaFin }, enTransaccion) {
  const cliente = await pool.connect();
  let deshacer = null;

  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [canchaId, usuarioId, fecha, horaInicio, horaFin, ESTADO_CONFIRMADA]
    );

    const reserva = Reserva.aDominio(rows[0]);
    if (enTransaccion) deshacer = (await enTransaccion(cliente, reserva)) ?? null;

    await cliente.query('COMMIT');
    return reserva;
  } catch (error) {
    await cliente.query('ROLLBACK');
    if (deshacer) await deshacer().catch((falla) => console.error('[RESERVA] No se pudo deshacer el cobro:', falla.message));
    throw error;
  } finally {
    cliente.release();
  }
}

// US-29: el código de reserva (8 caracteres del id) es único por restricción de la base. Dos ids distintos pueden
// dar el mismo código con una probabilidad ínfima: en ese caso se reintenta con un id nuevo (el INSERT falla
// antes de ejecutar el cobro, así que reintentar no cobra dos veces).
const INTENTOS_POR_CODIGO_REPETIDO = 3;
const INDICE_CODIGO_UNICO = 'uq_reservas_codigo';

async function crear(datos, enTransaccion) {
  for (let intento = 1; ; intento += 1) {
    try {
      return await crearUnaVez(datos, enTransaccion);
    } catch (error) {
      if (error.constraint !== INDICE_CODIGO_UNICO || intento >= INTENTOS_POR_CODIGO_REPETIDO) throw error;
    }
  }
}

// US-29: busca una reserva por su código para la verificación del administrador. Devuelve solo lo necesario
// para mostrarla (cancha, horario y nombre del usuario) y si ya venció, en hora de Colombia.
async function buscarPorCodigo(codigo) {
  const { rows } = await pool.query(
    `SELECT r.id, r.codigo, r.estado, r.usada_at,
            to_char(r.fecha, 'YYYY-MM-DD') AS fecha_texto,
            to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio_texto,
            to_char(r.hora_fin, 'HH24:MI') AS hora_fin_texto,
            (${FIN_RESERVA} < ${AHORA_COLOMBIA}) AS vencida,
            c.nombre AS cancha_nombre, c.direccion AS cancha_direccion,
            u.nombre AS usuario_nombre
     FROM reservas r
     JOIN canchas c ON c.id = r.cancha_id
     JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.codigo = $1`,
    [codigo]
  );

  return rows[0] ?? null;
}

// Marca la reserva como utilizada solo si sigue vigente: confirmada, sin usar y sin vencer. El WHERE hace que dos
// administradores no puedan marcarla a la vez (solo uno recibe la fila).
async function marcarUsada(id, administradorId) {
  const { rows } = await pool.query(
    `UPDATE reservas r
     SET usada_at = now(), usada_por = $2
     WHERE r.id = $1 AND r.estado = $3 AND r.usada_at IS NULL AND ${FIN_RESERVA} >= ${AHORA_COLOMBIA}
     RETURNING r.usada_at`,
    [id, administradorId, ESTADO_CONFIRMADA]
  );

  return rows[0] ?? null;
}

// enTransaccion(cliente, reserva) corre después de marcarla cancelada y antes del COMMIT (por ejemplo, el
// reembolso): si falla, la reserva sigue confirmada.
async function cancelar(id, usuarioId, enTransaccion) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `UPDATE reservas
       SET estado = 'cancelada'
       WHERE id = $1 AND usuario_id = $2 AND estado = $3
       RETURNING *`,
      [id, usuarioId, ESTADO_CONFIRMADA]
    );

    const cancelada = Reserva.aDominio(rows[0]);
    if (cancelada && enTransaccion) await enTransaccion(cliente, cancelada);

    await cliente.query('COMMIT');
    return cancelada;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

const ESTADO_CANCELADA_ADMIN = 'cancelada_administrativamente';

// US-16: búsqueda del administrador por cancha, fecha o usuario (nombre o correo). Solo
// devuelve reservas futuras (que aún no terminan), que son las únicas que se pueden gestionar.
async function listarFuturasParaAdmin({ canchaId = null, fecha = null, usuario = null, limite = 20, offset = 0 }) {
  const condiciones = [`${FIN_RESERVA} >= ${AHORA_COLOMBIA}`];
  const valores = [];

  if (canchaId) {
    valores.push(canchaId);
    condiciones.push(`r.cancha_id = $${valores.length}`);
  }

  if (fecha) {
    valores.push(fecha);
    condiciones.push(`r.fecha = $${valores.length}`);
  }

  if (usuario) {
    valores.push(`%${usuario.replace(/[\\%_]/g, '\\$&')}%`);
    condiciones.push(`(u.nombre ILIKE $${valores.length} OR u.correo ILIKE $${valores.length})`);
  }

  const donde = condiciones.join(' AND ');
  const desde = `FROM reservas r
       JOIN canchas c ON c.id = r.cancha_id
       JOIN usuarios u ON u.id = r.usuario_id`;

  const [{ rows }, { rows: conteo }] = await Promise.all([
    pool.query(
      `SELECT r.*, c.nombre AS cancha_nombre, c.direccion AS cancha_direccion,
              u.nombre AS usuario_nombre, u.correo AS usuario_correo,
              to_char(r.fecha, 'YYYY-MM-DD') AS fecha_texto,
              to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio_texto,
              to_char(r.hora_fin, 'HH24:MI') AS hora_fin_texto
       ${desde}
       WHERE ${donde}
       ORDER BY r.fecha ASC, r.hora_inicio ASC
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limite, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total ${desde} WHERE ${donde}`, valores),
  ]);

  return { reservas: rows.map(Reserva.aAdmin), total: conteo[0].total };
}

// US-16: cambia el estado y registra la auditoría en la misma transacción: no puede quedar una
// reserva cancelada sin su registro (ni un registro sin cancelación). Devuelve null si la reserva
// ya no estaba confirmada (otra cancelación llegó primero).
async function cancelarAdministrativamente({ id, administradorId, motivo }, enTransaccion) {
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `UPDATE reservas SET estado = $2 WHERE id = $1 AND estado = $3 RETURNING *`,
      [id, ESTADO_CANCELADA_ADMIN, ESTADO_CONFIRMADA]
    );

    if (rows.length === 0) {
      await cliente.query('ROLLBACK');
      return null;
    }

    await cliente.query(
      `INSERT INTO cancelaciones_administrativas (reserva_id, administrador_id, motivo) VALUES ($1, $2, $3)`,
      [id, administradorId, motivo]
    );

    const cancelada = Reserva.aDominio(rows[0]);
    // US-28: si la reserva estaba pagada, el reembolso va dentro de la misma transacción de la cancelación.
    if (enTransaccion) await enTransaccion(cliente, cancelada);

    await cliente.query('COMMIT');
    return cancelada;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// US-15: reservas confirmadas que todavía no terminan en una cancha (se muestran al advertir antes de desactivarla).
async function listarFuturasConfirmadasDeCancha(canchaId, limite = 20) {
  const { rows } = await pool.query(
    `SELECT r.*, u.nombre AS usuario_nombre, u.correo AS usuario_correo,
            to_char(r.fecha, 'YYYY-MM-DD') AS fecha_texto,
            to_char(r.hora_inicio, 'HH24:MI') AS hora_inicio_texto,
            to_char(r.hora_fin, 'HH24:MI') AS hora_fin_texto
     FROM reservas r
     JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.cancha_id = $1 AND r.estado = $2 AND ${FIN_RESERVA} >= ${AHORA_COLOMBIA}
     ORDER BY r.fecha ASC, r.hora_inicio ASC
     LIMIT $3`,
    [canchaId, ESTADO_CONFIRMADA, limite]
  );

  return rows.map((fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    usuarioNombre: fila.usuario_nombre,
    fecha: fila.fecha_texto,
    horaInicio: fila.hora_inicio_texto,
    horaFin: fila.hora_fin_texto,
  }));
}

module.exports = {
  listarFuturasConfirmadasDeCancha,
  listarFuturasParaAdmin,
  cancelarAdministrativamente,
  listarPorCanchaYFecha,
  existeConfirmada,
  existeSolapadaDeUsuario,
  contarActivasPorUsuario,
  listarPorUsuario,
  listarTodasPorUsuario,
  obtenerPorId,
  buscarPorCodigo,
  marcarUsada,
  crear,
  cancelar,
};
