const reservaRepository = require('../repositories/reservaRepository');
const canchaRepository = require('../repositories/canchaRepository');
const usuarioRepository = require('../repositories/usuarioRepository');
const pagoRepository = require('../repositories/pagoRepository');
const emailService = require('./emailService');
const temporizadorService = require('./temporizadorReservaService');
const retencionService = require('./retencionService');
const metodoPagoService = require('./metodoPagoService');
const pagoService = require('./pagoService');
const Pago = require('../models/Pago');
const { validarFranjaEnHorario } = require('./horarioReservaService');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');
const { esMomentoPasado, minutosHastaInicio } = require('../utils/fechaHora');
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

async function crearReserva({ canchaId, usuarioId, fecha, horaInicio, horaFin, metodoPagoId }) {
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

  // US-28: el pago con tarjeta es opcional; si se elige, debe ser una tarjeta propia y vigente.
  const metodoPago = metodoPagoId ? await metodoPagoService.obtenerParaPagar(usuarioId, metodoPagoId) : null;

  // US-18: si otro usuario tiene la franja retenida, no se le puede quitar.
  await retencionService.verificarDisponibleParaReservar(usuarioId, canchaId, fecha, horaInicio);

  let reserva;
  let pagoCobrado = null;
  try {
    // El cobro ocurre dentro de la misma transacción que crea la reserva: si la pasarela rechaza el
    // pago (402) la reserva no se guarda, y si se guarda queda con su pago registrado.
    const cobrar = metodoPago
      ? async (cliente, nueva) => {
          const resultado = await pagoService.cobrarReserva(cliente, { reserva: nueva, metodoPago, monto: cancha.costoHora });
          pagoCobrado = resultado.pago;
          return resultado.deshacer;
        }
      : undefined;

    reserva = await reservaRepository.crear({ canchaId, usuarioId, fecha, horaInicio, horaFin }, cobrar);
  } catch (error) {
    if (CODIGOS_FRANJA_OCUPADA.includes(error.code)) {
      throw new ErrorDeAplicacion('El horario ya no está disponible', 409);
    }

    throw error;
  }

  const reservaConfirmada = {
    ...reserva,
    cancha: { id: cancha.id, nombre: cancha.nombre, direccion: cancha.direccion },
    pago: Pago.aPublico(pagoCobrado),
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

// US-14: correo con el detalle de la reserva cancelada. Su fallo no deshace la cancelación.
function enviarCorreoCancelacion(usuarioId, reserva, reembolso) {
  Promise.all([usuarioRepository.buscarPorId(usuarioId), canchaRepository.obtenerPorId(reserva.canchaId)])
    .then(([usuario, cancha]) => {
      if (!usuario || !cancha) return null;
      return emailService.enviarCorreoCancelacionReserva({
        para: usuario.correo,
        nombre: usuario.nombre,
        reserva: { ...reserva, cancha: { id: cancha.id, nombre: cancha.nombre, direccion: cancha.direccion } },
        reembolso,
      });
    })
    .catch((error) => {
      console.error(`[EMAIL] No se pudo enviar la cancelación de ${reserva.codigo}:`, error.message);
    });
}

async function listarReservasDeUsuario(usuarioId) {
  return reservaRepository.listarTodasPorUsuario(usuarioId);
}

function mensajeFueraDePlazo() {
  const horas = env.horasMinimasCancelacion;
  return `Solo puedes cancelar una reserva con al menos ${horas} ${horas === 1 ? 'hora' : 'horas'} de anticipación al inicio. Ya no es posible cancelar esta reserva.`;
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

  // US-14: solo se puede cancelar con la anticipación mínima (también cubre las reservas que ya empezaron).
  const minutosRestantes = minutosHastaInicio(reserva.fecha, String(reserva.horaInicio).slice(0, 5));
  if (!(minutosRestantes >= env.horasMinimasCancelacion * 60)) {
    throw new ErrorDeAplicacion(mensajeFueraDePlazo(), 409, 'CANCELACION_FUERA_DE_PLAZO');
  }

  // US-28: si la reserva se pagó con tarjeta, el reembolso se hace dentro de la misma transacción de la cancelación.
  const pago = await pagoRepository.obtenerPorReserva(id);
  let reembolsado = null;
  const reembolsar = pago?.estado === 'aprobado'
    ? async (cliente) => {
        reembolsado = await pagoService.reembolsar(cliente, pago);
      }
    : undefined;

  const cancelada = await reservaRepository.cancelar(id, usuarioId, reembolsar);
  if (!cancelada) {
    // Otra petición la canceló justo antes.
    throw new ErrorDeAplicacion('Esta reserva ya estaba cancelada', 409);
  }

  retencionService.notificarFranjaLiberada(usuarioId, cancelada);

  const reembolso = reembolsado ? Pago.aPublico(reembolsado) : null;
  enviarCorreoCancelacion(usuarioId, cancelada, reembolso);

  return { reserva: cancelada, reembolso };
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
    minutosMinimosCancelacion: Math.round(env.horasMinimasCancelacion * 60),
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

module.exports = { crearReserva, cancelarReserva, listarReservasDeUsuario, validarQueNoSeaPasado, listarMisReservas };
