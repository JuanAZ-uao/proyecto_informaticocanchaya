const metodoPagoService = require('../services/metodoPagoService');

async function listar(req, res, next) {
  try {
    const metodosPago = await metodoPagoService.listarMetodosDePago(req.usuarioId);
    return res.status(200).json({ metodosPago });
  } catch (error) {
    return next(error);
  }
}

async function agregar(req, res, next) {
  try {
    const { numero, titular, vencimientoMes, vencimientoAnio, cvv } = req.body;
    const metodoPago = await metodoPagoService.agregarMetodoDePago(req.usuarioId, { numero, titular, vencimientoMes, vencimientoAnio, cvv });

    // La respuesta solo contiene la tarjeta enmascarada.
    return res.status(201).json({ mensaje: 'Tarjeta guardada correctamente', metodoPago });
  } catch (error) {
    return next(error);
  }
}

async function eliminar(req, res, next) {
  try {
    await metodoPagoService.eliminarMetodoDePago(req.usuarioId, req.params.metodoId);
    return res.status(200).json({ mensaje: 'Método de pago eliminado' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listar, agregar, eliminar };
