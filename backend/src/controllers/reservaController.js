<<<<<<< HEAD
﻿const reservaService = require('../services/reservaService');

async function confirmar(req, res, next) {
  try {
    const { fecha, horaInicio, horaFin } = req.body;

    const reserva = await reservaService.confirmarReserva({
=======
const reservaService = require('../services/reservaService');

async function crear(req, res, next) {
  try {
    const { fecha, horaInicio, horaFin } = req.body;

    const reserva = await reservaService.crearReserva({
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
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

<<<<<<< HEAD
module.exports = { confirmar };
=======
async function cancelar(req, res, next) {
  try {
    const reserva = await reservaService.cancelarReserva(req.params.id, req.usuarioId);
    return res.status(200).json({ reserva });
  } catch (error) {
    return next(error);
  }
}

module.exports = { crear, cancelar };
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
