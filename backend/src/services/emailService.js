const nodemailer = require('nodemailer');
const env = require('../config/env');

function crearTransportador() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
}

const transportador = crearTransportador();

async function enviarCorreoRecuperacion({ para, enlaceRestablecimiento }) {
  const asunto = 'CanchaYa - Recuperación de contraseña';
  const html = `
    <p>Recibimos una solicitud para restablecer tu contraseña en CanchaYa.</p>
    <p>Haz clic en el siguiente enlace para definir una nueva contraseña (válido por un tiempo limitado):</p>
    <p><a href="${enlaceRestablecimiento}">${enlaceRestablecimiento}</a></p>
    <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
  `;

  if (!transportador) {
    console.log('[EMAIL] SMTP no configurado. Enlace de recuperación (modo desarrollo):');
    console.log(`[EMAIL] Para: ${para} -> ${enlaceRestablecimiento}`);
    return { simulado: true };
  }

  return transportador.sendMail({
    from: env.smtp.from,
    to: para,
    subject: asunto,
    html,
  });
}

module.exports = { enviarCorreoRecuperacion };
