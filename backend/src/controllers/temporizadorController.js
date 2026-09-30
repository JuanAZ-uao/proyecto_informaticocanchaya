const temporizadorService = require('../services/temporizadorReservaService');
const { validarQueNoSeaPasado } = require('../services/reservaService');

async function completarPanel(req, res, next) {
  try {
    // Se valida el bloque antes de detener el temporizador: si la hora ya pasó,
    // el usuario sigue con su cuenta regresiva y puede elegir otro bloque.
    const { fecha, horaInicio } = req.body;
    validarQueNoSeaPasado(fecha, horaInicio);

    const resultado = temporizadorService.completarSesion(req.usuarioId, req.params.id);
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

module.exports = { completarPanel };
