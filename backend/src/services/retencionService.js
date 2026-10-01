const { EventEmitter } = require('events');
const retencionRepository = require('../repositories/retencionRepository');
const reservaRepository = require('../repositories/reservaRepository');
const temporizadorService = require('./temporizadorReservaService');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');
const { esMomentoPasado } = require('../utils/fechaHora');
const Retencion = require('../models/Retencion');

// Tras entrar al panel de confirmación el temporizador se detiene (US-17); la franja
// sigue retenida este tiempo para que el usuario confirme sin que otro se la quite.
const VENTANA_CONFIRMACION_MS = 10 * 60 * 1000;
const CODIGO_VIOLACION_UNICA = '23505';
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Eventos: 'retenida' | 'liberada' | 'reservada', cada uno con { usuarioId, franja }.
const eventos = new EventEmitter();

function emitir(evento, usuarioId, retencion) {
  eventos.emit(evento, { usuarioId, franja: Retencion.aFranjaPublica(retencion) });
}

function mismaFranja(a, b) {
  return a.fecha === b.fecha && a.horaInicio === b.horaInicio;
}

function validarFranja({ fecha, horaInicio, horaFin } = {}) {
  if (!FECHA_REGEX.test(fecha || '') || !HORA_REGEX.test(horaInicio || '') || !HORA_REGEX.test(horaFin || '')) {
    throw new ErrorDeAplicacion('La franja debe tener fecha (YYYY-MM-DD), horaInicio y horaFin (HH:mm)', 400, 'DATOS_INVALIDOS');
  }

  if (horaFin <= horaInicio) {
    throw new ErrorDeAplicacion('horaFin debe ser posterior a horaInicio', 400, 'DATOS_INVALIDOS');
  }

  if (esMomentoPasado(fecha, horaInicio)) {
    throw new ErrorDeAplicacion('No se pueden reservar fechas u horas pasadas', 400, 'HORA_PASADA');
  }
}

function vencimientoDeRetencion(usuarioId, canchaId) {
  const sesion = temporizadorService.obtenerSesion(usuarioId, canchaId);

  if (sesion?.estado === 'activo' && sesion.expiresAt > Date.now()) return sesion.expiresAt;
  if (sesion?.estado === 'completado') return Date.now() + VENTANA_CONFIRMACION_MS;

  throw new ErrorDeAplicacion(
    'Tu tiempo para reservar expiró. Reinicia el temporizador para continuar.',
    409,
    'SESION_EXPIRADA'
  );
}

async function retenerFranja(usuarioId, canchaId, franja) {
  validarFranja(franja);
  const expiresAt = vencimientoDeRetencion(usuarioId, canchaId);
  const { fecha, horaInicio, horaFin } = franja;

  if (await reservaRepository.existeConfirmada(canchaId, fecha, horaInicio)) {
    throw new ErrorDeAplicacion('El horario ya no está disponible', 409, 'FRANJA_OCUPADA');
  }

  let resultado;
  try {
    resultado = await retencionRepository.retener({ usuarioId, canchaId, fecha, horaInicio, horaFin, expiresAt });
  } catch (error) {
    if (error.code === CODIGO_VIOLACION_UNICA) {
      throw new ErrorDeAplicacion('Otro usuario está reservando esta franja en este momento', 409, 'FRANJA_RETENIDA');
    }
    throw error;
  }

  const { retencion, anterior } = resultado;
  if (anterior && !mismaFranja(anterior, retencion)) emitir('liberada', usuarioId, anterior);
  if (!anterior || !mismaFranja(anterior, retencion)) emitir('retenida', usuarioId, retencion);

  return retencion;
}

async function liberarFranja(usuarioId, canchaId) {
  const liberada = await retencionRepository.liberarDeUsuario(usuarioId, canchaId);
  if (liberada) emitir('liberada', usuarioId, liberada);
  return liberada;
}

// Usado al entrar al panel de confirmación: garantiza que el usuario tenga retenida la
// franja que va a confirmar (la retiene si aún no lo había hecho) y la mantiene mientras confirma.
async function asegurarRetencionParaConfirmar(usuarioId, canchaId, franja) {
  const actual = await retencionRepository.obtenerVigentePorFranja(canchaId, franja.fecha, franja.horaInicio);

  if (!actual || actual.usuarioId !== usuarioId) {
    await retenerFranja(usuarioId, canchaId, franja);
  }
}

async function extenderParaConfirmar(usuarioId, canchaId) {
  await retencionRepository.extenderDeUsuario(usuarioId, canchaId, Date.now() + VENTANA_CONFIRMACION_MS);
}

async function verificarDisponibleParaReservar(usuarioId, canchaId, fecha, horaInicio) {
  const retencion = await retencionRepository.obtenerVigentePorFranja(canchaId, fecha, horaInicio);

  if (retencion && retencion.usuarioId !== usuarioId) {
    throw new ErrorDeAplicacion('Otro usuario está reservando esta franja en este momento', 409, 'FRANJA_RETENIDA');
  }
}

// US-11 + US-18: la retención se convierte en reserva definitiva. Se elimina la retención
// del usuario en la cancha y se avisa a los demás que la franja quedó reservada.
async function convertirEnReserva(usuarioId, canchaId, reserva) {
  const franjaReservada = {
    canchaId,
    fecha: reserva.fecha,
    horaInicio: String(reserva.horaInicio).slice(0, 5),
    horaFin: String(reserva.horaFin).slice(0, 5),
  };

  const liberada = await retencionRepository.liberarDeUsuario(usuarioId, canchaId);
  if (liberada && !mismaFranja(liberada, franjaReservada)) emitir('liberada', usuarioId, liberada);
  emitir('reservada', usuarioId, franjaReservada);
}

// Una reserva cancelada vuelve a quedar libre: se avisa en tiempo real a quien mira la cancha.
function notificarFranjaLiberada(usuarioId, reserva) {
  emitir('liberada', usuarioId, {
    canchaId: reserva.canchaId,
    fecha: reserva.fecha,
    horaInicio: String(reserva.horaInicio).slice(0, 5),
    horaFin: String(reserva.horaFin).slice(0, 5),
  });
}

async function listarRetenidasPorOtros(canchaId, fecha, usuarioId) {
  const retenciones = await retencionRepository.listarVigentesPorCanchaYFecha(canchaId, fecha);
  return retenciones.filter((r) => r.usuarioId !== usuarioId).map(Retencion.aFranjaPublica);
}

async function barrerVencidas() {
  const vencidas = await retencionRepository.eliminarVencidas();
  vencidas.forEach((retencion) => emitir('liberada', retencion.usuarioId, retencion));
  return vencidas.length;
}

// Cuando la sesión termina (expiró, el usuario salió de la cancha o reinició), su franja se libera.
temporizadorService.eventos.on('terminada', ({ usuarioId, canchaId }) => {
  liberarFranja(usuarioId, canchaId).catch((error) =>
    console.error('[RETENCION] No se pudo liberar la franja al terminar la sesión:', error.message)
  );
});

module.exports = {
  VENTANA_CONFIRMACION_MS,
  retenerFranja,
  liberarFranja,
  asegurarRetencionParaConfirmar,
  extenderParaConfirmar,
  verificarDisponibleParaReservar,
  convertirEnReserva,
  notificarFranjaLiberada,
  listarRetenidasPorOtros,
  barrerVencidas,
  eventos,
};
