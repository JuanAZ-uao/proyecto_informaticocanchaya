const env = require('./env');

const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

// Una página servida por la propia API (por ejemplo Swagger UI en /api/docs) llama desde su mismo origen.
function esMismoOrigen(origin, host) {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// CORS_ORIGIN admite uno o varios orígenes separados por comas. En cada uno, "*" reemplaza un tramo del nombre
// de host (letras, números y guiones), p. ej. https://canchaya-*.vercel.app para las previews de un PR (staging).
// Un comodín debe ir precedido de texto propio y dejar un dominio real: "*", "https://*" o "https://*.vercel.app"
// se ignoran, porque permitirían cualquier sitio.
const escaparRegex = (texto) => texto.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

function convertirAPatron(entrada) {
  const limpia = entrada.trim().replace(/\/+$/, '');
  if (!limpia) return null;
  if (!limpia.includes('*')) return (origin) => origin === limpia;

  const inicioHost = limpia.indexOf('://') + 3;
  const comodinSinPrefijo = limpia.indexOf('*') <= inicioHost;
  const sinDominio = !/[a-z0-9-]\.[a-z]{2,}/i.test(limpia.replace(/\*/g, ''));
  if (inicioHost < 3 || comodinSinPrefijo || sinDominio) return null;

  const regex = new RegExp(`^${limpia.split('*').map(escaparRegex).join('[a-z0-9-]+')}$`, 'i');
  return (origin) => regex.test(origin);
}

function origenesPermitidos() {
  return String(env.corsOrigin || '')
    .split(',')
    .map(convertirAPatron)
    .filter(Boolean);
}

function origenPermitido(origin) {
  // Sin origin (ej. Postman/curl) o cualquier puerto de localhost en desarrollo.
  if (!origin) return true;
  if (env.nodeEnv !== 'production' && LOCALHOST_ORIGIN_REGEX.test(origin)) return true;
  return origenesPermitidos().some((coincide) => coincide(origin));
}

// Para las librerías cors y Socket.IO: un origen ajeno simplemente no recibe cabeceras CORS.
function verificarOrigen(origin, callback) {
  return callback(null, origenPermitido(origin));
}

// Para la API REST: un navegador desde un origen ajeno recibe un 403 claro en lugar de un error interno.
function rechazarOrigenNoPermitido(req, res, next) {
  if (origenPermitido(req.headers.origin) || esMismoOrigen(req.headers.origin, req.headers.host)) return next();
  return res.status(403).json({ mensaje: 'Origen no permitido' });
}

module.exports = verificarOrigen;
module.exports.origenPermitido = origenPermitido;
module.exports.rechazarOrigenNoPermitido = rechazarOrigenNoPermitido;
