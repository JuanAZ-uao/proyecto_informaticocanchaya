const temporizadorService = require('../services/temporizadorReservaService');

async function completarPanel(req, res, next) {
  try {
    const resultado = temporizadorService.completarSesion(req.usuarioId, req.params.id);
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

module.exports = { completarPanel };
