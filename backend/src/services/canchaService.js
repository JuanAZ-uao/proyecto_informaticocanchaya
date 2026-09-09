const canchaRepository = require('../repositories/canchaRepository');

async function listarCanchasDisponibles() {
  const canchas = await canchaRepository.listarDisponibles();

  return canchas.map((cancha) => ({
    id: cancha._id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
  }));
}

module.exports = { listarCanchasDisponibles };
