const canchaRepository = require('../repositories/canchaRepository');
const reservaRepository = require('../repositories/reservaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const CODIGO_VIOLACION_UNICA = '23505';

async function crearReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
  const cancha = await canchaRepository.obtenerPorId(canchaId);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  if (horaFin <= horaInicio) {
    throw new ErrorDeAplicacion('horaFin debe ser posterior a horaInicio', 400);
  }

  try {
    return await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin });
  } catch (error) {
    if (error.code === CODIGO_VIOLACION_UNICA) {
      throw new ErrorDeAplicacion(
        'Ese horario ya fue reservado por otra persona. Por favor elige otra franja.',
        409
      );
    }

    throw error;
  }
}

async function cancelarReserva(id, usuarioId) {
  const reserva = await reservaRepository.obtenerPorId(id);
  if (!reserva) {
    throw new ErrorDeAplicacion('Reserva no encontrada', 404);
  }

  if (reserva.usuarioId !== usuarioId) {
    throw new ErrorDeAplicacion('No tienes permiso para cancelar esta reserva', 403);
  }

  if (reserva.estado === 'cancelada') {
    throw new ErrorDeAplicacion('Esta reserva ya estaba cancelada', 409);
  }

  return reservaRepository.cancelar(id, usuarioId);
}

module.exports = { crearReserva, cancelarReserva };
