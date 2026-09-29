<<<<<<< HEAD
﻿const reservaRepository = require('../repositories/reservaRepository');
const canchaRepository = require('../repositories/canchaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const CODIGO_VIOLACION_UNICIDAD_POSTGRES = '23505';
const MENSAJE_HORARIO_NO_DISPONIBLE = 'El horario ya no está disponible';

function combinarFechaHora(fecha, hora) {
  return new Date(`${fecha}T${hora}:00`);
}

async function confirmarReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
=======
const canchaRepository = require('../repositories/canchaRepository');
const reservaRepository = require('../repositories/reservaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const CODIGO_VIOLACION_UNICA = '23505';

async function crearReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
  const cancha = await canchaRepository.obtenerPorId(canchaId);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

<<<<<<< HEAD
  const momentoSolicitado = combinarFechaHora(fecha, horaInicio);
  if (Number.isNaN(momentoSolicitado.getTime()) || momentoSolicitado.getTime() <= Date.now()) {
    throw new ErrorDeAplicacion('No se pueden reservar fechas u horas pasadas', 400);
  }

  const reservasDelDia = await reservaRepository.listarPorCanchaYFecha(canchaId, fecha);
  const yaOcupado = reservasDelDia.some(
    (reserva) => reserva.horaInicio.slice(0, 5) === horaInicio
  );
  if (yaOcupado) {
    throw new ErrorDeAplicacion(MENSAJE_HORARIO_NO_DISPONIBLE, 409);
=======
  if (horaFin <= horaInicio) {
    throw new ErrorDeAplicacion('horaFin debe ser posterior a horaInicio', 400);
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
  }

  try {
    return await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin });
  } catch (error) {
<<<<<<< HEAD
    if (error.code === CODIGO_VIOLACION_UNICIDAD_POSTGRES) {
      throw new ErrorDeAplicacion(MENSAJE_HORARIO_NO_DISPONIBLE, 409);
    }
=======
    if (error.code === CODIGO_VIOLACION_UNICA) {
      throw new ErrorDeAplicacion(
        'Ese horario ya fue reservado por otra persona. Por favor elige otra franja.',
        409
      );
    }

>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
    throw error;
  }
}

<<<<<<< HEAD
module.exports = { confirmarReserva };
=======
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
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
