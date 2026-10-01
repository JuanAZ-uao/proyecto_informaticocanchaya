const canchaService = require('../services/canchaService');
const retencionService = require('../services/retencionService');

async function listar(req, res, next) {
  try {
    const { zona, precioMin, precioMax, fecha } = req.query;

    const filtros = {
      zona: zona || null,
      precioMin: precioMin !== undefined ? Number(precioMin) : null,
      precioMax: precioMax !== undefined ? Number(precioMax) : null,
      fecha: fecha || null,
    };

    const canchas = await canchaService.listarCanchasDisponibles(filtros);
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

async function listarOcupados(req, res, next) {
  try {
    const [ocupados, retenidos] = await Promise.all([
      canchaService.listarBloquesOcupados(req.params.id, req.query.fecha),
      retencionService.listarRetenidasPorOtros(req.params.id, req.query.fecha, req.usuarioId),
    ]);
    return res.status(200).json({ ocupados, retenidos });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar, obtenerDetalle, listarOcupados };
