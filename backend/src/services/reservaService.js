const reservaRepository = require('../repositories/reservaRepository');
const canchaRepository = require('../repositories/canchaRepository');
const usuarioRepository = require('../repositories/usuarioRepository');
const emailService = require('./emailService');
const temporizadorService = require('./temporizadorReservaService');
const retencionService = require('./retencionService');
const { validarFranjaEnHorario } = require('./horarioReservaService');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');
const { esMomentoPasado, aMomentoColombia } = require('../utils/fechaHora');
const env = require('../config/env');

// 23505: índice único (misma franja). 23P01: restricción de exclusión (franjas que se solapan).
const CODIGOS_FRANJA_OCUPADA = ['23505', '23P01'];
const MENSAJE_HORA_PASADA = 'No se pueden reservar fechas u horas pasadas';
const MENSAJE_SOLAPE_USUARIO = 'Ya tienes una reserva en ese horario';

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

  await validarFranjaEnHorario(canchaId, { fecha, horaInicio, horaFin });

  // US-12: el usuario puede tener varias reservas activas (en cualquier cancha), pero
  // no dos que se solapen en el tiempo, y hasta un máximo configurable de simultáneas.
  if (await reservaRepository.existeSolapadaDeUsuario(usuarioId, fecha, horaInicio, horaFin)) {
    throw new ErrorDeAplicacion(MENSAJE_SOLAPE_USUARIO, 409, 'RESERVA_SOLAPADA');
  }

  const totalActivas = await reservaRepository.contarActivasPorUsuario(usuarioId);
  if (totalActivas >= env.maxReservasActivasPorUsuario) {
    throw new ErrorDeAplicacion(
      `Ya tienes ${env.maxReservasActivasPorUsuario} reservas activas. Cancela alguna para poder reservar otra.`,
      409,
      'LIMITE_RESERVAS_ALCANZADO'
    );
  }

  // US-18: si otro usuario tiene la franja retenida, no se le puede quitar.
  await retencionService.verificarDisponibleParaReservar(usuarioId, canchaId, fecha, horaInicio);

  let reserva;
  try {
    reserva = await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin });
  } catch (error) {
    if (CODIGOS_FRANJA_OCUPADA.includes(error.code)) {
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
  return reservaRepository.listarTodasPorUsuario(usuarioId);
}

async function cancelarReserva(id, usuarioId) {
  const reserva = await reservaRepository.obtenerPorId(id);
  if (!reserva) {
    throw new ErrorDeAplicacion('Reserva no encontrada', 404);
  }

  if (reserva.usuarioId !== usuarioId) {
    throw new ErrorDeAplicacion('No tienes permiso para cancelar esta reserva', 403);
  }

  // Cubre 'cancelada' y 'cancelada_administrativamente' (US-16): solo se cancela una confirmada.
  if (reserva.estado !== 'confirmada') {
    throw new ErrorDeAplicacion('Esta reserva ya estaba cancelada', 409);
  }

  const cancelada = await reservaRepository.cancelar(id, usuarioId);
  if (cancelada) retencionService.notificarFranjaLiberada(usuarioId, cancelada);
  return cancelada;
}


// US-16: el administrador solo puede cancelar con al menos 2 horas de anticipación.
const ANTICIPACION_MINIMA_CANCELACION_ADMIN_MS = 2 * 60 * 60 * 1000;
const MOTIVO_MAXIMO = 500;
const RESERVAS_ADMIN_POR_PAGINA = 20;

async function listarReservasAdmin({ canchaId, fecha, usuario, pagina = 1, limite = RESERVAS_ADMIN_POR_PAGINA }) {
  const limiteSeguro = Math.min(Math.max(limite, 1), MAXIMO_POR_PAGINA);
  const paginaSegura = Math.max(pagina, 1);

  const { reservas, total } = await reservaRepository.listarFuturasParaAdmin({
    canchaId: canchaId || null,
    fecha: fecha || null,
    usuario: usuario ? usuario.trim() : null,
    limite: limiteSeguro,
    offset: (paginaSegura - 1) * limiteSeguro,
  });

  return {
    reservas,
    paginacion: {
      pagina: paginaSegura,
      limite: limiteSeguro,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / limiteSeguro)),
    },
  };
}

async function cancelarReservaComoAdmin({ id, administradorId, motivo, ahora = Date.now() }) {
  const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
  if (!motivoLimpio) {
    throw new ErrorDeAplicacion('El motivo de la cancelación es obligatorio', 400, 'MOTIVO_OBLIGATORIO');
  }
  if (motivoLimpio.length > MOTIVO_MAXIMO) {
    throw new ErrorDeAplicacion(`El motivo no puede superar los ${MOTIVO_MAXIMO} caracteres`, 400, 'MOTIVO_OBLIGATORIO');
  }

  const reserva = await reservaRepository.obtenerPorId(id);
  if (!reserva) {
    throw new ErrorDeAplicacion('Reserva no encontrada', 404);
  }

  if (reserva.estado !== 'confirmada') {
    throw new ErrorDeAplicacion('Esta reserva ya estaba cancelada', 409);
  }

  const inicio = aMomentoColombia(reserva.fecha, String(reserva.horaInicio).slice(0, 5));
  if (inicio.getTime() - ahora < ANTICIPACION_MINIMA_CANCELACION_ADMIN_MS) {
    throw new ErrorDeAplicacion(
      'No se puede cancelar: faltan menos de 2 horas para el inicio de la reserva (o ya comenzó)',
      409,
      'CANCELACION_FUERA_DE_PLAZO'
    );
  }

  const cancelada = await reservaRepository.cancelarAdministrativamente({
    id,
    administradorId,
    motivo: motivoLimpio,
  });
  if (!cancelada) {
    throw new ErrorDeAplicacion('Esta reserva ya estaba cancelada', 409);
  }

  // La cancelación ya quedó guardada: ni el aviso en tiempo real ni el correo pueden deshacerla.
  retencionService.notificarFranjaLiberada(cancelada.usuarioId, cancelada);
  enviarCorreoCancelacionAdministrativa(cancelada, motivoLimpio);

  return cancelada;
}

function enviarCorreoCancelacionAdministrativa(reserva, motivo) {
  Promise.all([usuarioRepository.buscarPorId(reserva.usuarioId), canchaRepository.obtenerPorId(reserva.canchaId)])
    .then(([usuario, cancha]) => {
      if (!usuario) return null;
      return emailService.enviarCorreoCancelacionAdministrativa({
        para: usuario.correo,
        nombre: usuario.nombre,
        reserva: {
          ...reserva,
          cancha: { id: reserva.canchaId, nombre: cancha?.nombre ?? '', direccion: cancha?.direccion ?? '' },
        },
        motivo,
      });
    })
    .catch((error) => {
      console.error(`[EMAIL] No se pudo enviar la cancelación de ${reserva.codigo}:`, error.message);
    });
}

const RESERVAS_POR_PAGINA = 10;
const MAXIMO_POR_PAGINA = 50;

async function listarMisReservas({
  usuarioId,
  periodo = 'proximas',
  estado = null,
  pagina = 1,
  limite = RESERVAS_POR_PAGINA,
}) {
  const limiteSeguro = Math.min(Math.max(limite, 1), MAXIMO_POR_PAGINA);
  const paginaSegura = Math.max(pagina, 1);

  const { reservas, total } = await reservaRepository.listarPorUsuario({
    usuarioId,
    periodo,
    estado,
    limite: limiteSeguro,
    offset: (paginaSegura - 1) * limiteSeguro,
  });

  return {
    reservas,
    paginacion: {
      pagina: paginaSegura,
      limite: limiteSeguro,
      total,
      totalPaginas: Math.max(1, Math.ceil(total / limiteSeguro)),
    },
  };
}

module.exports = {
  crearReserva,
  cancelarReserva,
  listarReservasDeUsuario,
  validarQueNoSeaPasado,
  listarMisReservas,
  listarReservasAdmin,
  cancelarReservaComoAdmin,
};
