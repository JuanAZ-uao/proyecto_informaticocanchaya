const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const reservaRepository = require('../repositories/reservaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

// US-15: gestión de canchas por un administrador (crear, editar, desactivar y reactivar).
const MAXIMO_RESERVAS_EN_ADVERTENCIA = 20;

const aHoraCorta = (hora) => String(hora).slice(0, 5);

function aVistaAdmin(cancha, horarios) {
  return {
    id: cancha.id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
    zona: cancha.zona,
    costoHora: cancha.costoHora,
    tipo: cancha.tipo,
    descripcion: cancha.descripcion,
    servicios: cancha.servicios,
    imagenUrl: cancha.imagenUrl,
    disponible: cancha.disponible,
    reservasFuturas: cancha.reservasFuturas ?? 0,
    ...(horarios
      ? { horarios: horarios.map((h) => ({ diaSemana: h.diaSemana, horaInicio: aHoraCorta(h.horaInicio), horaFin: aHoraCorta(h.horaFin) })) }
      : {}),
  };
}

// Deja solo los campos permitidos y normaliza los textos; así un cliente no puede cambiar columnas internas.
function limpiarDatos(cuerpo) {
  return {
    nombre: cuerpo.nombre.trim(),
    direccion: cuerpo.direccion.trim(),
    zona: cuerpo.zona?.trim() || undefined,
    costoHora: Number(cuerpo.costoHora),
    tipo: cuerpo.tipo || undefined,
    descripcion: cuerpo.descripcion?.trim() || undefined,
    servicios: (cuerpo.servicios ?? []).map((servicio) => servicio.trim()),
  };
}

const limpiarHorarios = (horarios) =>
  horarios.map(({ diaSemana, horaInicio, horaFin }) => ({ diaSemana, horaInicio, horaFin }));

async function listarCanchas() {
  const canchas = await canchaRepository.listarTodasParaAdmin();
  return canchas.map((cancha) => aVistaAdmin(cancha));
}

async function obtenerCancha(id) {
  const cancha = await canchaRepository.obtenerParaAdmin(id);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  return aVistaAdmin(cancha, await horarioRepository.listarPorCancha(id));
}

async function crearCancha(cuerpo) {
  const creada = await canchaRepository.crearConHorarios(limpiarDatos(cuerpo), limpiarHorarios(cuerpo.horarios));
  return obtenerCancha(creada.id);
}

// Editar no toca las reservas ya confirmadas: conservan su fecha, su hora y su precio pagado.
async function editarCancha(id, cuerpo) {
  const actualizada = await canchaRepository.actualizarConHorarios(id, limpiarDatos(cuerpo), limpiarHorarios(cuerpo.horarios));
  if (!actualizada) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  return obtenerCancha(id);
}

// Si la cancha tiene reservas futuras, el administrador debe confirmar de forma explícita. Las reservas se conservan:
// desactivar solo la oculta del listado público y bloquea las nuevas reservas.
async function desactivarCancha(id, { confirmar = false } = {}) {
  const cancha = await canchaRepository.obtenerParaAdmin(id);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  if (!cancha.disponible) {
    throw new ErrorDeAplicacion('La cancha ya estaba desactivada', 409, 'CANCHA_YA_DESACTIVADA');
  }

  if (cancha.reservasFuturas > 0 && !confirmar) {
    return {
      requiereConfirmacion: true,
      reservasAfectadas: cancha.reservasFuturas,
      reservas: await reservaRepository.listarFuturasConfirmadasDeCancha(id, MAXIMO_RESERVAS_EN_ADVERTENCIA),
    };
  }

  await canchaRepository.cambiarDisponibilidad(id, false);
  return { requiereConfirmacion: false, reservasAfectadas: cancha.reservasFuturas, cancha: await obtenerCancha(id) };
}

async function activarCancha(id) {
  const cancha = await canchaRepository.obtenerParaAdmin(id);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  if (cancha.disponible) {
    throw new ErrorDeAplicacion('La cancha ya estaba activa', 409, 'CANCHA_YA_ACTIVA');
  }

  await canchaRepository.cambiarDisponibilidad(id, true);
  return obtenerCancha(id);
}

module.exports = { listarCanchas, obtenerCancha, crearCancha, editarCancha, desactivarCancha, activarCancha };
