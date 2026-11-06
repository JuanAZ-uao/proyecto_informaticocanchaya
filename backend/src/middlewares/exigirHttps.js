// US-28: los datos de tarjeta solo deben viajar cifrados. Con EXIGIR_HTTPS_PAGOS=true las rutas de
// métodos de pago rechazan (426) las peticiones que no llegaron por HTTPS. Detrás de un proxy con TLS
// hay que activar también TRUST_PROXY=true para que Express lea X-Forwarded-Proto.
const env = require('../config/env');

function exigirHttps(req, res, next) {
  if (!env.exigirHttpsPagos || req.secure) {
    return next();
  }

  return res.status(426).json({
    mensaje: 'Las operaciones con tarjetas solo se permiten por una conexión segura (HTTPS)',
    codigo: 'HTTPS_REQUERIDO',
  });
}

module.exports = exigirHttps;
