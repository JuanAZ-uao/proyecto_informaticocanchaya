const TABLA = 'horarios_disponibles';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    canchaId: fila.cancha_id,
    diaSemana: fila.dia_semana,
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
  };
}

module.exports = { TABLA, aDominio };
