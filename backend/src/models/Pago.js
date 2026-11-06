const TABLA = 'pagos';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    reservaId: fila.reserva_id,
    usuarioId: fila.usuario_id,
    metodoPagoId: fila.metodo_pago_id,
    marca: fila.marca,
    ultimos4: fila.ultimos4,
    monto: Number(fila.monto),
    moneda: fila.moneda,
    estado: fila.estado,
    referencia: fila.referencia,
    reembolsoReferencia: fila.reembolso_referencia,
    createdAt: fila.created_at,
    reembolsadoAt: fila.reembolsado_at,
  };
}

// Resumen que ve el usuario (sin referencias internas de la pasarela).
function aPublico(pago) {
  if (!pago) return null;

  return {
    estado: pago.estado,
    monto: pago.monto,
    moneda: pago.moneda,
    marca: pago.marca,
    ultimos4: pago.ultimos4,
  };
}

module.exports = { TABLA, aDominio, aPublico };
