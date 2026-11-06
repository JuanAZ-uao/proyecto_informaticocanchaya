const pool = require('../config/db');
const Pago = require('../models/Pago');

// Se registra dentro de la misma transacción que crea la reserva: o quedan las dos, o ninguna.
async function registrar(cliente, { reservaId, usuarioId, metodoPagoId, marca, ultimos4, monto, moneda, referencia }) {
  const { rows } = await cliente.query(
    `INSERT INTO pagos (reserva_id, usuario_id, metodo_pago_id, marca, ultimos4, monto, moneda, referencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [reservaId, usuarioId, metodoPagoId, marca, ultimos4, monto, moneda, referencia]
  );

  return Pago.aDominio(rows[0]);
}

async function obtenerPorReserva(reservaId) {
  const { rows } = await pool.query('SELECT * FROM pagos WHERE reserva_id = $1', [reservaId]);
  return Pago.aDominio(rows[0]);
}

async function marcarReembolsado(cliente, id, reembolsoReferencia) {
  const { rows } = await cliente.query(
    `UPDATE pagos
     SET estado = 'reembolsado', reembolso_referencia = $2, reembolsado_at = now()
     WHERE id = $1 AND estado = 'aprobado'
     RETURNING *`,
    [id, reembolsoReferencia]
  );

  return Pago.aDominio(rows[0]);
}

module.exports = { registrar, obtenerPorReserva, marcarReembolsado };
