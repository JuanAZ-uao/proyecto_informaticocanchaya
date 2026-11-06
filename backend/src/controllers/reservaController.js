const reservaService = require('../services/reservaService');

async function crear(req, res, next) {
  try {
    const { fecha, horaInicio, horaFin, metodoPagoId } = req.body;

    const reserva = await reservaService.crearReserva({
      canchaId: req.params.id,
      usuarioId: req.usuarioId,
      fecha,
      horaInicio,
      horaFin,
      metodoPagoId,
    });

    return res.status(201).json({ reserva });
  } catch (error) {
    return next(error);
  }
}

async function cancelar(req, res, next) {
  try {
    const { reserva, reembolso } = await reservaService.cancelarReserva(req.params.id, req.usuarioId);
    return res.status(200).json({ reserva, reembolso });
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

// US-13: historial paginado con filtros (periodo, estado, pagina, limite).
async function listarHistorial(req, res, next) {
  try {
    const { periodo, estado, pagina, limite } = req.query;
    const resultado = await reservaService.listarMisReservas({
      usuarioId: req.usuarioId,
      periodo,
      estado: estado || null,
      pagina,
      limite,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

// US-16: búsqueda de reservas futuras por cancha, fecha o usuario (solo administradores).
async function listarParaAdmin(req, res, next) {
  try {
    const { canchaId, fecha, usuario, pagina, limite } = req.query;
    const resultado = await reservaService.listarReservasAdmin({ canchaId, fecha, usuario, pagina, limite });
    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

// US-16: cancelación administrativa con motivo obligatorio.
async function cancelarComoAdmin(req, res, next) {
  try {
    const reserva = await reservaService.cancelarReservaComoAdmin({
      id: req.params.id,
      administradorId: req.administrador.id,
      motivo: req.body.motivo,
    });
    return res.status(200).json({ reserva });
  } catch (error) {
    return next(error);
  }
}

module.exports = { crear, cancelar, listarMias, listarHistorial, listarParaAdmin, cancelarComoAdmin };
