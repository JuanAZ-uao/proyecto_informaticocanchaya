const reservaService = require('../services/reservaService');

async function confirmar(req, res, next) {
  try {
    const { fecha, horaInicio, horaFin } = req.body;

    const reserva = await reservaService.confirmarReserva({
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

module.exports = { confirmar };
