const canchaRepository = require('../repositories/canchaRepository');

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

module.exports = { listarCanchasDisponibles };
