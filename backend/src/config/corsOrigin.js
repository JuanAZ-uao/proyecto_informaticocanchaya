const env = require('./env');

const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

function origenPermitido(origin) {
  // Sin origin (ej. Postman/curl) o cualquier puerto de localhost en desarrollo.
  if (!origin) return true;
  if (env.nodeEnv !== 'production' && LOCALHOST_ORIGIN_REGEX.test(origin)) return true;
  return origin === env.corsOrigin;
}

// Para las librerías cors y Socket.IO: un origen ajeno simplemente no recibe cabeceras CORS.
function verificarOrigen(origin, callback) {
  return callback(null, origenPermitido(origin));
}

// Para la API REST: un navegador desde un origen ajeno recibe un 403 claro en lugar de un error interno.
function rechazarOrigenNoPermitido(req, res, next) {
  if (origenPermitido(req.headers.origin)) return next();
  return res.status(403).json({ mensaje: 'Origen no permitido' });
}

module.exports = verificarOrigen;
module.exports.origenPermitido = origenPermitido;
module.exports.rechazarOrigenNoPermitido = rechazarOrigenNoPermitido;
