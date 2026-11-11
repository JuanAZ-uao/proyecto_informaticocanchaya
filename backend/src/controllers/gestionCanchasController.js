const gestionCanchasService = require('../services/gestionCanchasService');

// US-15: gestión de canchas (solo administradores; el middleware de la ruta responde 403 al resto).
async function listar(req, res, next) {
  try {
    return res.status(200).json({ canchas: await gestionCanchasService.listarCanchas() });
  } catch (error) {
    return next(error);
  }
}

async function obtener(req, res, next) {
  try {
    return res.status(200).json({ cancha: await gestionCanchasService.obtenerCancha(req.params.id) });
  } catch (error) {
    return next(error);
  }
}

async function crear(req, res, next) {
  try {
    const cancha = await gestionCanchasService.crearCancha(req.body);
    return res.status(201).json({ mensaje: 'Cancha creada correctamente', cancha });
  } catch (error) {
    return next(error);
  }
}

async function editar(req, res, next) {
  try {
    const cancha = await gestionCanchasService.editarCancha(req.params.id, req.body);
    return res.status(200).json({ mensaje: 'Cancha actualizada correctamente', cancha });
  } catch (error) {
    return next(error);
  }
}

async function desactivar(req, res, next) {
  try {
    const resultado = await gestionCanchasService.desactivarCancha(req.params.id, { confirmar: req.body.confirmar === true });

    if (resultado.requiereConfirmacion) {
      return res.status(409).json({
        mensaje: `La cancha tiene ${resultado.reservasAfectadas} reserva(s) futura(s) confirmada(s). Confirma para desactivarla: las reservas se conservan, pero no se aceptarán nuevas.`,
        codigo: 'CONFIRMACION_REQUERIDA',
        reservasAfectadas: resultado.reservasAfectadas,
        reservas: resultado.reservas,
      });
    }

    return res.status(200).json({ mensaje: 'Cancha desactivada correctamente', reservasAfectadas: resultado.reservasAfectadas, cancha: resultado.cancha });
  } catch (error) {
    return next(error);
  }
}

async function activar(req, res, next) {
  try {
    const cancha = await gestionCanchasService.activarCancha(req.params.id);
    return res.status(200).json({ mensaje: 'Cancha activada correctamente', cancha });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar, obtener, crear, editar, desactivar, activar };
