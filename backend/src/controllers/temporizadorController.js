const temporizadorService = require('../services/temporizadorReservaService');
const retencionService = require('../services/retencionService');
const { validarQueNoSeaPasado } = require('../services/reservaService');

async function completarPanel(req, res, next) {
  try {
    // Se valida el bloque antes de detener el temporizador: si la hora ya pasó o la franja
    // la tiene retenida otro usuario, el usuario sigue con su cuenta regresiva y elige otro.
    const { fecha, horaInicio, horaFin } = req.body;
    const usuarioId = req.usuarioId;
    const canchaId = req.params.id;
    validarQueNoSeaPasado(fecha, horaInicio);

    await retencionService.asegurarRetencionParaConfirmar(usuarioId, canchaId, { fecha, horaInicio, horaFin });
    const resultado = await temporizadorService.completarSesion(usuarioId, canchaId);
    await retencionService.extenderParaConfirmar(usuarioId, canchaId);

    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

module.exports = { completarPanel };
