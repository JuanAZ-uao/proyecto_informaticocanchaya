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

async function listarPorUsuario({ usuarioId, periodo = 'proximas', estado = null, limite = 10, offset = 0 }) {
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
              ${ESTADO_VISIBLE} AS estado_visible
       FROM reservas r
       JOIN canchas c ON c.id = r.cancha_id
       WHERE ${donde}
       ORDER BY r.fecha ${orden}, r.hora_inicio ${orden}
       LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
      [...valores, limite, offset]
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

module.exports = {
  listarPorCanchaYFecha,
  existeConfirmada,
  existeSolapadaDeUsuario,
  contarActivasPorUsuario,
  listarPorUsuario,
  listarTodasPorUsuario,
  obtenerPorId,
  crear,
  cancelar,
};
