const pool = require('../config/db');

function aDominio(fila) {
  return {
    id: fila.id,
    administrador: fila.administrador_nombre ?? null,
    codigo: fila.codigo,
    resultado: fila.resultado,
    reservaCodigo: fila.reserva_codigo ?? null,
    createdAt: fila.created_at,
  };
}

async function registrar({ administradorId, codigo, resultado, reservaId }) {
  await pool.query(
    `INSERT INTO verificaciones_reserva (administrador_id, codigo, resultado, reserva_id)
     VALUES ($1, $2, $3, $4)`,
    [administradorId, codigo, resultado, reservaId ?? null]
  );
}

async function listarRecientes(limite = 20) {
  const { rows } = await pool.query(
    `SELECT v.id, v.codigo, v.resultado, v.created_at,
            u.nombre AS administrador_nombre, r.codigo AS reserva_codigo
     FROM verificaciones_reserva v
     LEFT JOIN usuarios u ON u.id = v.administrador_id
     LEFT JOIN reservas r ON r.id = v.reserva_id
     ORDER BY v.created_at DESC
     LIMIT $1`,
    [limite]
  );

  return rows.map(aDominio);
}

module.exports = { registrar, listarRecientes };
