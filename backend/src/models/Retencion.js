const { formatearFecha } = require('./Reserva');

const TABLA = 'retenciones';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    canchaId: fila.cancha_id,
    fecha: formatearFecha(fila.fecha),
    horaInicio: fila.hora_inicio.slice(0, 5),
    horaFin: fila.hora_fin.slice(0, 5),
    expiresAt: new Date(fila.expires_at).getTime(),
  };
}

// Lo que se comparte con otros usuarios por socket: la franja, nunca quién la retiene.
function aFranjaPublica(retencion) {
  return {
    canchaId: retencion.canchaId,
    fecha: retencion.fecha,
    horaInicio: retencion.horaInicio,
    horaFin: retencion.horaFin,
  };
}

module.exports = { TABLA, aDominio, aFranjaPublica };
