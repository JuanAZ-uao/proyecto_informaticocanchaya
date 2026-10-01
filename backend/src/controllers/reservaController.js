const reservaService = require('../services/reservaService');

async function crear(req, res, next) {
  try {
    const { fecha, horaInicio, horaFin } = req.body;

    const reserva = await reservaService.crearReserva({
      canchaId: req.params.id,
      usuarioId: req.usuarioId,
      fecha,
      horaInicio,
      horaFin,
    });

    return res.status(201).json({ reserva });
  } catch (error) {
    return next(error);
  }
}

async function cancelar(req, res, next) {
  try {
    const reserva = await reservaService.cancelarReserva(req.params.id, req.usuarioId);
    return res.status(200).json({ reserva });
  } catch (error) {
    return next(error);
  }
}

async function listarMias(req, res, next) {
  try {
    const reservas = await reservaService.listarReservasDeUsuario(req.usuarioId);
    return res.status(200).json({ reservas });
  } catch (error) {
    return next(error);
  }
}

module.exports = { crear, cancelar, listarMias };
