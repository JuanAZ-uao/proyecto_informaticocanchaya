const reservaRepository = require('../repositories/reservaRepository');
const canchaRepository = require('../repositories/canchaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const CODIGO_VIOLACION_UNICIDAD_POSTGRES = '23505';
const MENSAJE_HORARIO_NO_DISPONIBLE = 'El horario ya no está disponible';

function combinarFechaHora(fecha, hora) {
  return new Date(`${fecha}T${hora}:00`);
}

async function confirmarReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
  const cancha = await canchaRepository.obtenerPorId(canchaId);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

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
  }

  try {
    return await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin });
  } catch (error) {
    if (error.code === CODIGO_VIOLACION_UNICIDAD_POSTGRES) {
      throw new ErrorDeAplicacion(MENSAJE_HORARIO_NO_DISPONIBLE, 409);
    }
    throw error;
  }
}

module.exports = { confirmarReserva };
