const reservaRepository = require('../repositories/reservaRepository');
const canchaRepository = require('../repositories/canchaRepository');
const usuarioRepository = require('../repositories/usuarioRepository');
const emailService = require('./emailService');
const temporizadorService = require('./temporizadorReservaService');
const retencionService = require('./retencionService');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');
const { esMomentoPasado } = require('../utils/fechaHora');

const CODIGO_VIOLACION_UNICA = '23505';
const MENSAJE_HORA_PASADA = 'No se pueden reservar fechas u horas pasadas';

function validarQueNoSeaPasado(fecha, horaInicio) {
  if (esMomentoPasado(fecha, horaInicio)) {
    throw new ErrorDeAplicacion(MENSAJE_HORA_PASADA, 400);
  }
}

async function crearReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin }) {
  const cancha = await canchaRepository.obtenerPorId(canchaId);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  validarQueNoSeaPasado(fecha, horaInicio);

  if (horaFin <= horaInicio) {
    throw new ErrorDeAplicacion('horaFin debe ser posterior a horaInicio', 400);
  }

  // US-18: si otro usuario tiene la franja retenida, no se le puede quitar.
  await retencionService.verificarDisponibleParaReservar(usuarioId, canchaId, fecha, horaInicio);

  let reserva;
  try {
    reserva = await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin });
  } catch (error) {
    if (error.code === CODIGO_VIOLACION_UNICA) {
      throw new ErrorDeAplicacion('El horario ya no está disponible', 409);
    }

    throw error;
  }

  const reservaConfirmada = {
    ...reserva,
    cancha: { id: cancha.id, nombre: cancha.nombre, direccion: cancha.direccion },
  };

  // La reserva ya quedó guardada: el temporizador (US-17) se da por terminado, la
  // retención (US-18) se convierte en reserva definitiva y el correo se envía en segundo
  // plano. Ninguno de estos pasos puede deshacer ni retrasar la confirmación.
  temporizadorService
    .finalizarSesion(usuarioId, canchaId)
    .catch((error) => console.error('[RESERVA] No se pudo finalizar el temporizador:', error.message));
  await retencionService
    .convertirEnReserva(usuarioId, canchaId, reservaConfirmada)
    .catch((error) => console.error('[RESERVA] No se pudo convertir la retención:', error.message));
  enviarCorreoConfirmacion(usuarioId, reservaConfirmada);

  return reservaConfirmada;
}

function enviarCorreoConfirmacion(usuarioId, reserva) {
  usuarioRepository
    .buscarPorId(usuarioId)
    .then((usuario) => {
      if (!usuario) return null;
      return emailService.enviarCorreoConfirmacionReserva({
        para: usuario.correo,
        nombre: usuario.nombre,
        reserva,
      });
    })
    .catch((error) => {
      console.error(`[EMAIL] No se pudo enviar la confirmación de ${reserva.codigo}:`, error.message);
    });
}

async function listarReservasDeUsuario(usuarioId) {
  return reservaRepository.listarPorUsuario(usuarioId);
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

  const cancelada = await reservaRepository.cancelar(id, usuarioId);
  if (cancelada) retencionService.notificarFranjaLiberada(usuarioId, cancelada);
  return cancelada;
}

module.exports = { crearReserva, cancelarReserva, listarReservasDeUsuario, validarQueNoSeaPasado };
