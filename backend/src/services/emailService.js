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

// Los datos de entrada del usuario no deben poder falsear líneas del log (saltos de línea).
function paraLog(valor) {
  return String(valor).replace(/[\r\n\t]+/g, ' ');
}

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
    console.log(`[EMAIL] Para: ${paraLog(para)} -> ${paraLog(enlaceRestablecimiento)}`);
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
    console.log(`[EMAIL] SMTP no configurado. Confirmación de reserva (modo desarrollo) para ${paraLog(para)}: ${reserva.codigo} · ${paraLog(reserva.cancha.nombre)} · ${reserva.fecha} ${horario}`);
    return { simulado: true };
  }

  return transportador.sendMail({
    from: env.smtp.from,
    to: para,
    subject: asunto,
    html,
  });
}

// El motivo lo escribe un administrador: se escapa antes de insertarlo en el HTML del correo.
function escaparHtml(valor) {
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// US-16: aviso al usuario de que un administrador canceló su reserva, con el motivo.
async function enviarCorreoCancelacionAdministrativa({ para, nombre, reserva, motivo }) {
  const horario = `${reserva.horaInicio.slice(0, 5)} - ${reserva.horaFin.slice(0, 5)}`;
  const asunto = `CanchaYa - Reserva cancelada ${reserva.codigo}`;
  const html = `
    <p>Hola ${escaparHtml(nombre)}, lamentamos informarte que un administrador canceló tu reserva.</p>
    <ul>
      <li><strong>Código:</strong> ${escaparHtml(reserva.codigo)}</li>
      <li><strong>Cancha:</strong> ${escaparHtml(reserva.cancha.nombre)} (${escaparHtml(reserva.cancha.direccion)})</li>
      <li><strong>Fecha:</strong> ${escaparHtml(reserva.fecha)}</li>
      <li><strong>Hora:</strong> ${horario}</li>
      <li><strong>Estado:</strong> cancelada administrativamente</li>
    </ul>
    <p><strong>Motivo de la cancelación:</strong> ${escaparHtml(motivo)}</p>
    <p>Puedes reservar otra franja disponible desde CanchaYa.</p>
  `;

  if (!transportador) {
    console.log(`[EMAIL] SMTP no configurado. Cancelación administrativa (modo desarrollo) para ${paraLog(para)}: ${paraLog(reserva.codigo)} · motivo: ${paraLog(motivo)}`);
    return { simulado: true };
  }

  return transportador.sendMail({
    from: env.smtp.from,
    to: para,
    subject: asunto,
    html,
  });
}

module.exports = { enviarCorreoRecuperacion, enviarCorreoConfirmacionReserva, enviarCorreoCancelacionAdministrativa };
