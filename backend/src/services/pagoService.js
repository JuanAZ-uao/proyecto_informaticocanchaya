// Cobro y reembolso de reservas (US-28 y US-14). Todo pasa por la pasarela de pago: aquí nunca hay números
// de tarjeta, solo el token guardado.
const pasarela = require('./pasarelaPago');
const pagoRepository = require('../repositories/pagoRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const MONEDA = 'COP';

function pasarelaNoDisponible(error, contexto) {
  console.error(`[PAGO] ${contexto}:`, error.message);
}

// Cobra la reserva y registra el pago dentro de la transacción que la crea. Si el pago es rechazado lanza un
// 402 y la reserva no se guarda. Devuelve el pago y la función que lo reembolsa por si el COMMIT falla después.
async function cobrarReserva(cliente, { reserva, metodoPago, monto }) {
  let resultado;

  try {
    resultado = await pasarela.cobrar({ token: metodoPago.token, monto, moneda: MONEDA, descripcion: `Reserva ${reserva.codigo}`, referenciaExterna: reserva.id });
  } catch (error) {
    pasarelaNoDisponible(error, 'La pasarela no respondió al cobrar');
    throw new ErrorDeAplicacion('No fue posible comunicarse con la pasarela de pago. Tu reserva no se confirmó; intenta de nuevo.', 502, 'PASARELA_NO_DISPONIBLE');
  }

  if (!resultado.aprobado) {
    throw new ErrorDeAplicacion(
      `El pago fue rechazado: ${resultado.motivo}. Tu reserva no se confirmó; intenta con otro método de pago.`,
      402,
      'PAGO_RECHAZADO'
    );
  }

  const deshacer = () => pasarela.reembolsar({ referencia: resultado.referencia });

  try {
    const pago = await pagoRepository.registrar(cliente, {
      reservaId: reserva.id,
      usuarioId: metodoPago.usuarioId,
      metodoPagoId: metodoPago.id,
      marca: metodoPago.marca,
      ultimos4: metodoPago.ultimos4,
      monto,
      moneda: MONEDA,
      referencia: resultado.referencia,
    });

    return { pago, deshacer };
  } catch (error) {
    // Se cobró pero no se pudo registrar: se devuelve el dinero antes de propagar el error.
    await deshacer().catch((falla) => pasarelaNoDisponible(falla, 'No se pudo devolver un cobro sin registrar'));
    throw error;
  }
}

// Devuelve el pago de una reserva que se cancela, dentro de la misma transacción: si el reembolso falla,
// la reserva sigue confirmada y el usuario puede reintentar.
async function reembolsar(cliente, pago) {
  let resultado;

  try {
    resultado = await pasarela.reembolsar({ referencia: pago.referencia });
  } catch (error) {
    pasarelaNoDisponible(error, 'La pasarela no respondió al reembolsar');
    throw new ErrorDeAplicacion('No fue posible procesar el reembolso. La reserva no se canceló; intenta de nuevo.', 502, 'REEMBOLSO_FALLIDO');
  }

  return pagoRepository.marcarReembolsado(cliente, pago.id, resultado.referencia);
}

module.exports = { MONEDA, cobrarReserva, reembolsar };
