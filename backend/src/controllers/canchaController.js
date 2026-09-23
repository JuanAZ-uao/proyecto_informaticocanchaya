const canchaService = require('../services/canchaService');

async function listar(req, res, next) {
  try {
    const canchas = await canchaService.listarCanchasDisponibles();
    return res.status(200).json({ canchas });
  } catch (error) {
    return next(error);
  }
}

async function obtenerDetalle(req, res, next) {
  try {
    const cancha = await canchaService.obtenerDetalleCancha(req.params.id);
    return res.status(200).json({ cancha });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar, obtenerDetalle };
