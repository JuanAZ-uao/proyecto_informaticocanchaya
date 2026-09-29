const env = require('./env');

const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

function verificarOrigen(origin, callback) {
  // Sin origin (ej. Postman/curl) o cualquier puerto de localhost en desarrollo.
  if (!origin || (env.nodeEnv !== 'production' && LOCALHOST_ORIGIN_REGEX.test(origin))) {
    return callback(null, true);
  }

  if (origin === env.corsOrigin) {
    return callback(null, true);
  }

  return callback(new Error('No permitido por CORS'));
}

module.exports = verificarOrigen;
