const canchaService = require('../services/canchaService');

async function listar(req, res, next) {
  try {
    const { zona, precioMin, precioMax, fecha } = req.query;

    const filtros = {
      zona: zona || null,
      precioMin: precioMin !== undefined ? Number(precioMin) : null,
      precioMax: precioMax !== undefined ? Number(precioMax) : null,
      // La fecha se valida por formato (US-06), pero aún no filtra disponibilidad real:
      // eso depende del motor de reservas (EPIC-03 / US-07 y US-08), todavía en construcción.
      fecha: fecha || null,
    };

    const canchas = await canchaService.listarCanchasDisponibles(filtros);
    return res.status(200).json({ canchas });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar };
