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

async function enviarCorreoConfirmacionReserva({ para, nombre, reserva }) {
  const horario = `${reserva.horaInicio.slice(0, 5)} - ${reserva.horaFin.slice(0, 5)}`;
  const asunto = `CanchaYa - Reserva confirmada ${reserva.codigo}`;
  const html = `
    <p>Hola ${nombre}, tu reserva quedó confirmada.</p>
    <ul>
      <li><strong>Código:</strong> ${reserva.codigo}</li>
      <li><strong>Cancha:</strong> ${reserva.cancha.nombre} (${reserva.cancha.direccion})</li>
      <li><strong>Fecha:</strong> ${reserva.fecha}</li>
      <li><strong>Hora:</strong> ${horario}</li>
      <li><strong>Estado:</strong> confirmada</li>
    </ul>
    <p>Puedes consultarla en la sección "Mis reservas" de CanchaYa.</p>
  `;

  if (!transportador) {
    console.log(`[EMAIL] SMTP no configurado. Confirmación de reserva (modo desarrollo) para ${para}: ${reserva.codigo} · ${reserva.cancha.nombre} · ${reserva.fecha} ${horario}`);
    return { simulado: true };
  }

  return transportador.sendMail({
    from: env.smtp.from,
    to: para,
    subject: asunto,
    html,
  });
}

module.exports = { enviarCorreoRecuperacion, enviarCorreoConfirmacionReserva };
