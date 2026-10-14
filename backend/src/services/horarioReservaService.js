const horarioRepository = require('../repositories/horarioRepository');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

// La interfaz ofrece bloques de 1 hora alineados con la hora de apertura del día. El backend exige
// lo mismo, de modo que ninguna reserva (ni desde la API directa) caiga fuera del horario de la
// cancha ni se solape parcialmente con otra.
const DURACION_BLOQUE_MIN = 60;

function aMinutos(hora) {
  const [horas, minutos] = String(hora).split(':').map(Number);
  return horas * 60 + minutos;
}

async function validarFranjaEnHorario(canchaId, { fecha, horaInicio, horaFin }) {
  const inicio = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);

  if (fin - inicio !== DURACION_BLOQUE_MIN) {
    throw new ErrorDeAplicacion('Las reservas son por bloques de 1 hora', 400, 'BLOQUE_INVALIDO');
  }

  const diaSemana = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  const horarios = await horarioRepository.listarPorCancha(canchaId);
  const horario = horarios.find((h) => h.diaSemana === diaSemana);

  const apertura = horario ? aMinutos(horario.horaInicio) : null;
  const cierre = horario ? aMinutos(horario.horaFin) : null;
  const dentroDelHorario = horario && inicio >= apertura && fin <= cierre && (inicio - apertura) % DURACION_BLOQUE_MIN === 0;

  if (!dentroDelHorario) {
    throw new ErrorDeAplicacion('La cancha no atiende en ese horario', 400, 'FUERA_DE_HORARIO');
  }
}

module.exports = { validarFranjaEnHorario, DURACION_BLOQUE_MIN };
