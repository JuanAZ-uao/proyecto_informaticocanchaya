const canchaService = require('../services/canchaService');

async function listar(req, res, next) {
  try {
    const canchas = await canchaService.listarCanchasDisponibles();
    return res.status(200).json({ canchas });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar };
