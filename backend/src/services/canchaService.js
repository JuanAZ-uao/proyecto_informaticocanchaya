const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const reservaRepository = require('../repositories/reservaRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

async function listarCanchasDisponibles(filtros = {}) {
  const canchas = await canchaRepository.listarDisponibles(filtros);

  return canchas.map((cancha) => ({
    id: cancha.id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
    zona: cancha.zona,
    costoHora: Number(cancha.costoHora),
  }));
}

async function obtenerDetalleCancha(id) {
  const cancha = await canchaRepository.obtenerPorId(id);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  const horarios = await horarioRepository.listarPorCancha(id);

  return {
    id: cancha.id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
    costoHora: cancha.costoHora,
    horarios: horarios.map((horario) => ({
      diaSemana: horario.diaSemana,
      horaInicio: horario.horaInicio,
      horaFin: horario.horaFin,
    })),
  };
}

async function listarBloquesOcupados(canchaId, fecha) {
  const cancha = await canchaRepository.obtenerPorId(canchaId);
  if (!cancha) {
    throw new ErrorDeAplicacion('Cancha no encontrada', 404);
  }

  const reservas = await reservaRepository.listarPorCanchaYFecha(canchaId, fecha);

  return reservas.map((reserva) => ({
    horaInicio: reserva.horaInicio,
    horaFin: reserva.horaFin,
  }));
}

module.exports = { listarCanchasDisponibles, obtenerDetalleCancha, listarBloquesOcupados };
