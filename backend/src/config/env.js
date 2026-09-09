require('dotenv').config();

const env = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  passwordResetTokenExpiresMin: Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MIN || 30),
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
