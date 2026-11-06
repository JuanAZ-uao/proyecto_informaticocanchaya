// Métodos de pago del usuario (US-28). El número completo y el CVV solo viajan hasta la pasarela, que
// devuelve un token: en la base de datos quedan únicamente el token, la marca y los últimos 4 dígitos.
const metodoPagoRepository = require('../repositories/metodoPagoRepository');
const MetodoPago = require('../models/MetodoPago');
const pasarela = require('./pasarelaPago');
const { validarTarjeta, estaVencida } = require('../utils/tarjeta');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const MAXIMO_TARJETAS_POR_USUARIO = 5;

function pasarelaNoDisponible(error, contexto) {
  console.error(`[PAGO] ${contexto}:`, error.message);
  return new ErrorDeAplicacion('No fue posible comunicarse con la pasarela de pago. Intenta de nuevo.', 502, 'PASARELA_NO_DISPONIBLE');
}

async function listarMetodosDePago(usuarioId) {
  const metodos = await metodoPagoRepository.listarPorUsuario(usuarioId);
  return metodos.map(MetodoPago.aPublico);
}

async function agregarMetodoDePago(usuarioId, tarjeta) {
  const { errores, datos } = validarTarjeta(tarjeta);

  if (errores.length) {
    throw new ErrorDeAplicacion('La tarjeta no es válida', 400, 'TARJETA_INVALIDA', errores);
  }

  if ((await metodoPagoRepository.contarPorUsuario(usuarioId)) >= MAXIMO_TARJETAS_POR_USUARIO) {
    throw new ErrorDeAplicacion(`Ya tienes ${MAXIMO_TARJETAS_POR_USUARIO} tarjetas guardadas. Elimina una para agregar otra.`, 409, 'LIMITE_TARJETAS');
  }

  let tokenizada;
  try {
    // El CVV existe solo en esta llamada: no se guarda ni se registra en ningún lado.
    tokenizada = await pasarela.tokenizarTarjeta({ ...datos, cvv: String(tarjeta.cvv) });
  } catch (error) {
    throw pasarelaNoDisponible(error, 'La pasarela no respondió al tokenizar');
  }

  const guardado = await metodoPagoRepository.crear({
    usuarioId,
    token: tokenizada.token,
    marca: tokenizada.marca,
    ultimos4: tokenizada.ultimos4,
    titular: datos.titular,
    vencimientoMes: datos.vencimientoMes,
    vencimientoAnio: datos.vencimientoAnio,
  });

  return MetodoPago.aPublico(guardado);
}

async function eliminarMetodoDePago(usuarioId, metodoId) {
  const metodo = await metodoPagoRepository.obtenerDeUsuario(metodoId, usuarioId);
  if (!metodo) {
    throw new ErrorDeAplicacion('Método de pago no encontrado', 404);
  }

  try {
    await pasarela.eliminarToken(metodo.token);
  } catch (error) {
    throw pasarelaNoDisponible(error, 'La pasarela no respondió al eliminar el token');
  }

  await metodoPagoRepository.eliminar(metodoId, usuarioId);
}

// Devuelve el método de pago (con su token) para cobrar una reserva; solo si es del usuario y no está vencido.
async function obtenerParaPagar(usuarioId, metodoId) {
  const metodo = await metodoPagoRepository.obtenerDeUsuario(metodoId, usuarioId);
  if (!metodo) {
    throw new ErrorDeAplicacion('Método de pago no encontrado', 404);
  }

  if (estaVencida(metodo.vencimientoMes, metodo.vencimientoAnio)) {
    throw new ErrorDeAplicacion('La tarjeta seleccionada está vencida. Elige otro método de pago.', 400, 'TARJETA_VENCIDA');
  }

  return metodo;
}

module.exports = {
  MAXIMO_TARJETAS_POR_USUARIO,
  listarMetodosDePago,
  agregarMetodoDePago,
  eliminarMetodoDePago,
  obtenerParaPagar,
};
