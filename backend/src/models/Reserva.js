const TABLA = 'reservas';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    canchaId: fila.cancha_id,
    usuarioId: fila.usuario_id,
    fecha: fila.fecha,
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
    createdAt: fila.created_at,
  };
}

module.exports = { TABLA, aDominio };
