const verificacionReservaService = require('../services/verificacionReservaService');

async function verificarCodigo(req, res, next) {
  try {
    const resultado = await verificacionReservaService.verificarCodigo(req.usuarioId, req.body.codigo);
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

async function marcarComoUsada(req, res, next) {
  try {
    const resultado = await verificacionReservaService.marcarComoUsada(req.usuarioId, req.params.codigo);
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

async function listarVerificaciones(req, res, next) {
  try {
    const verificaciones = await verificacionReservaService.listarVerificaciones(req.query.limite);
    return res.status(200).json({ verificaciones });
  } catch (error) {
    return next(error);
  }
}

module.exports = { verificarCodigo, marcarComoUsada, listarVerificaciones };
