// Selecciona la pasarela de pago activa (variable PASARELA_PAGO). Para integrar una real (Stripe, Wompi,
// PayU…) basta con añadir un módulo en ./pasarelas que cumpla el mismo contrato que ./pasarelas/simulada.
const env = require('../config/env');

const PASARELAS = {
  simulada: () => require('./pasarelas/simulada'),
};

function obtenerPasarela() {
  const cargar = PASARELAS[env.pasarelaPago];

  if (!cargar) {
    throw new Error(`Pasarela de pago desconocida: "${env.pasarelaPago}" (disponibles: ${Object.keys(PASARELAS).join(', ')})`);
  }

  return cargar();
}

module.exports = {
  tokenizarTarjeta: (tarjeta) => obtenerPasarela().tokenizarTarjeta(tarjeta),
  cobrar: (cobro) => obtenerPasarela().cobrar(cobro),
  reembolsar: (reembolso) => obtenerPasarela().reembolsar(reembolso),
  eliminarToken: (token) => obtenerPasarela().eliminarToken(token),
};
