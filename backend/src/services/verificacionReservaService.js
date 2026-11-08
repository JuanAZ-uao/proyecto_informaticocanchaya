// US-29: verificación del código de reserva por parte del administrador. Cada consulta y cada "marcar como
// utilizada" queda registrada (administrador, código, resultado, fecha) para auditoría.
const reservaRepository = require('../repositories/reservaRepository');
const verificacionRepository = require('../repositories/verificacionRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const FORMATO_CODIGO = /^CY-[0-9A-F]{8}$/;
const LARGO_MAXIMO_REGISTRADO = 40;

function normalizar(codigo) {
  return String(codigo ?? '').trim().toUpperCase();
}

// Lo que el administrador escribió se guarda para la auditoría, sin caracteres de control y acotado.
function paraAuditoria(codigo) {
  const limpio = Array.from(codigo, (caracter) => (caracter.charCodeAt(0) < 32 || caracter.charCodeAt(0) === 127 ? ' ' : caracter));
  return limpio.join('').slice(0, LARGO_MAXIMO_REGISTRADO);
}

// Orden de prioridad del motivo si se cumplen varios (por ejemplo, cancelada y además vencida).
function motivoNoVigente(reserva) {
  if (reserva.estado !== 'confirmada') return 'cancelada';
  if (reserva.usada_at) return 'usada';
  if (reserva.vencida) return 'vencida';
  return null;
}

function aResumen(reserva) {
  return {
    id: reserva.id,
    codigo: reserva.codigo,
    cancha: { nombre: reserva.cancha_nombre, direccion: reserva.cancha_direccion },
    fecha: reserva.fecha_texto,
    horaInicio: reserva.hora_inicio_texto,
    horaFin: reserva.hora_fin_texto,
    usuario: { nombre: reserva.usuario_nombre },
    usadaAt: reserva.usada_at ?? null,
  };
}

async function registrar(administradorId, codigoEscrito, resultado, reservaId) {
  await verificacionRepository.registrar({ administradorId, codigo: paraAuditoria(codigoEscrito), resultado, reservaId });
}

// Busca la reserva. Un código con formato inválido o que no existe responde igual ("Código no encontrado"),
// sin revelar nada de otras reservas.
async function buscarOFallar(administradorId, codigoEscrito) {
  const codigo = normalizar(codigoEscrito);
  const reserva = FORMATO_CODIGO.test(codigo) ? await reservaRepository.buscarPorCodigo(codigo) : null;

  if (!reserva) {
    await registrar(administradorId, codigo, 'no_encontrado', null);
    throw new ErrorDeAplicacion('Código no encontrado', 404, 'CODIGO_NO_ENCONTRADO');
  }

  return reserva;
}

async function verificarCodigo(administradorId, codigoEscrito) {
  const reserva = await buscarOFallar(administradorId, codigoEscrito);
  const motivo = motivoNoVigente(reserva);

  await registrar(administradorId, reserva.codigo, motivo ?? 'vigente', reserva.id);

  return { estado: motivo ? 'no_vigente' : 'vigente', motivo, reserva: aResumen(reserva) };
}

// Marca una reserva vigente como utilizada: a partir de ahí el código ya no puede validarse como vigente.
async function marcarComoUsada(administradorId, codigoEscrito) {
  const reserva = await buscarOFallar(administradorId, codigoEscrito);
  const motivo = motivoNoVigente(reserva);

  if (motivo) {
    await registrar(administradorId, reserva.codigo, motivo, reserva.id);
    throw new ErrorDeAplicacion(`La reserva no está vigente (${motivo}); no se puede marcar como utilizada`, 409, 'RESERVA_NO_VIGENTE');
  }

  const marcada = await reservaRepository.marcarUsada(reserva.id, administradorId);
  if (!marcada) {
    // Otro administrador la marcó (o venció) justo antes.
    await registrar(administradorId, reserva.codigo, 'usada', reserva.id);
    throw new ErrorDeAplicacion('La reserva ya no está vigente (usada); no se puede marcar como utilizada', 409, 'RESERVA_NO_VIGENTE');
  }

  await registrar(administradorId, reserva.codigo, 'marcada_usada', reserva.id);

  return { estado: 'no_vigente', motivo: 'usada', reserva: { ...aResumen(reserva), usadaAt: marcada.usada_at } };
}

async function listarVerificaciones(limite) {
  return verificacionRepository.listarRecientes(limite);
}

module.exports = { FORMATO_CODIGO, verificarCodigo, marcarComoUsada, listarVerificaciones };
