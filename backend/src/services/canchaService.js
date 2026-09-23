const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

async function listarCanchasDisponibles() {
  const canchas = await canchaRepository.listarDisponibles();

  return canchas.map((cancha) => ({
    id: cancha.id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
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

module.exports = { listarCanchasDisponibles, obtenerDetalleCancha };
