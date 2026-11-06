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

// Los datos escritos por el usuario (nombre, cancha) se insertan en HTML: se escapan para que no puedan inyectar etiquetas.
function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const formatearMonto = (monto, moneda) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(monto)} ${moneda}`;

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

// US-14: detalle de la reserva cancelada (y del reembolso, si estaba pagada).
async function enviarCorreoCancelacionReserva({ para, nombre, reserva, reembolso }) {
  const horario = `${reserva.horaInicio.slice(0, 5)} - ${reserva.horaFin.slice(0, 5)}`;
  const asunto = `CanchaYa - Reserva cancelada ${reserva.codigo}`;
  const lineaReembolso = reembolso
    ? `<p>Se reembolsó ${escaparHtml(formatearMonto(reembolso.monto, reembolso.moneda))} a tu tarjeta ${escaparHtml(reembolso.marca)} terminada en ${escaparHtml(reembolso.ultimos4)}.</p>`
    : '';
  const html = `
    <p>Hola ${escaparHtml(nombre)}, tu reserva fue cancelada y el horario quedó disponible para otros usuarios.</p>
    <ul>
      <li><strong>Código:</strong> ${escaparHtml(reserva.codigo)}</li>
      <li><strong>Cancha:</strong> ${escaparHtml(reserva.cancha.nombre)} (${escaparHtml(reserva.cancha.direccion)})</li>
      <li><strong>Fecha:</strong> ${escaparHtml(reserva.fecha)}</li>
      <li><strong>Hora:</strong> ${escaparHtml(horario)}</li>
      <li><strong>Estado:</strong> cancelada</li>
    </ul>
    ${lineaReembolso}
  `;

  if (!transportador) {
    console.log(`[EMAIL] SMTP no configurado. Cancelación de reserva (modo desarrollo) para ${paraLog(para)}: ${reserva.codigo} · ${paraLog(reserva.cancha.nombre)} · ${reserva.fecha} ${horario}`);
    return { simulado: true };
  }

  return transportador.sendMail({ from: env.smtp.from, to: para, subject: asunto, html });
}

// US-27: enlace para confirmar que el nuevo correo es del usuario; el cambio no se aplica hasta abrirlo.
async function enviarCorreoVerificacionCorreo({ para, nombre, enlaceVerificacion }) {
  const asunto = 'CanchaYa - Confirma tu nuevo correo';
  const html = `
    <p>Hola ${escaparHtml(nombre)}, recibimos una solicitud para usar este correo en tu cuenta de CanchaYa.</p>
    <p>Para confirmarlo, abre el siguiente enlace (válido por un tiempo limitado):</p>
    <p><a href="${escaparHtml(enlaceVerificacion)}">${escaparHtml(enlaceVerificacion)}</a></p>
    <p>Si no pediste este cambio, ignora este correo: tu cuenta seguirá con el correo anterior.</p>
  `;

  if (!transportador) {
    console.log('[EMAIL] SMTP no configurado. Enlace de verificación de correo (modo desarrollo):');
    console.log(`[EMAIL] Para: ${paraLog(para)} -> ${paraLog(enlaceVerificacion)}`);
    return { simulado: true };
  }

  return transportador.sendMail({ from: env.smtp.from, to: para, subject: asunto, html });
}

module.exports = {
  enviarCorreoRecuperacion,
  enviarCorreoConfirmacionReserva,
  enviarCorreoCancelacionReserva,
  enviarCorreoVerificacionCorreo,
};
