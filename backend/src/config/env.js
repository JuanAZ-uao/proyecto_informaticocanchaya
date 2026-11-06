require('dotenv').config();

const env = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  passwordResetTokenExpiresMin: Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MIN || 30),
  // US-12: tope de reservas "confirmada" simultáneas por usuario.
  maxReservasActivasPorUsuario: Number(process.env.MAX_RESERVAS_ACTIVAS_USUARIO || 5),
  // US-14: horas mínimas de anticipación para poder cancelar una reserva propia.
  horasMinimasCancelacion: Number(process.env.HORAS_MIN_CANCELACION || 2),
  // US-27: vigencia del enlace de verificación de un nuevo correo.
  cambioCorreoTokenExpiresMin: Number(process.env.EMAIL_CHANGE_TOKEN_EXPIRES_MIN || 60),
  // US-28: pasarela de pago activa ('simulada' no necesita credenciales) y exigencia de HTTPS en las rutas de tarjetas.
  pasarelaPago: process.env.PASARELA_PAGO || 'simulada',
  exigirHttpsPagos: process.env.EXIGIR_HTTPS_PAGOS === 'true',
  // Detrás de un proxy con TLS, confiar en X-Forwarded-Proto para saber si la conexión original era HTTPS.
  confiarEnProxy: process.env.TRUST_PROXY === 'true',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'CanchaYa <no-reply@canchaya.com>',
  },
};

if (!env.databaseUrl) {
  throw new Error('Falta la variable de entorno DATABASE_URL');
}

if (!env.jwtSecret) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

module.exports = env;
