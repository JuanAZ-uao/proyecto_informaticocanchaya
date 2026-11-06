const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const VENTANA_MS = 15 * 60 * 1000;
const MAX_LOGIN = Number(process.env.RATE_LIMIT_LOGIN_MAX || 10);
const MAX_RECUPERACION = Number(process.env.RATE_LIMIT_RECUPERACION_MAX || 5);
const MAX_CAMBIO_PASSWORD = Number(process.env.RATE_LIMIT_CAMBIO_PASSWORD_MAX || 10);

// El límite se aplica por IP y correo: quien falla muchas veces con una cuenta queda frenado
// para esa cuenta, sin bloquear a los demás usuarios que comparten la misma IP.
function claveIpYCorreo(req) {
  const correo = String(req.body?.correo ?? '').trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}|${correo}`;
}

function respuestaLimite(req, res) {
  res.status(429).json({
    mensaje: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    codigo: 'DEMASIADOS_INTENTOS',
  });
}

const base = { windowMs: VENTANA_MS, keyGenerator: claveIpYCorreo, handler: respuestaLimite, standardHeaders: 'draft-7', legacyHeaders: false };

// Solo cuentan los intentos fallidos: iniciar sesión bien no consume el cupo.
const limitarLogin = rateLimit({ ...base, limit: MAX_LOGIN, skipSuccessfulRequests: true });
const limitarRecuperacion = rateLimit({ ...base, limit: MAX_RECUPERACION });

// US-27: el cambio de contraseña pide la actual; se limitan los intentos fallidos por usuario (va después de authMiddleware).
const limitarCambioPassword = rateLimit({
  ...base,
  keyGenerator: (req) => `usuario:${req.usuarioId}`,
  limit: MAX_CAMBIO_PASSWORD,
  skipSuccessfulRequests: true,
});

module.exports = { limitarLogin, limitarRecuperacion, limitarCambioPassword };
