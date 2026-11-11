// Utilidades de las pruebas de humo y de carga: eligen una franja de una hora que cae DENTRO del horario de atención
// real de la cancha. Las canchas de producción tienen horarios distintos (hay 64 y no abren igual todos los días),
// así que una hora fija como "07:00" puede quedar fuera del horario y la reserva se rechaza con 400.

const hhmm = (hora) => String(hora).slice(0, 5);

const aMinutos = (hora) => {
  const [h, m] = hhmm(hora).split(':').map(Number);
  return h * 60 + m;
};

const deMinutos = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

// Día de la semana de una fecha ISO (0 = domingo ... 6 = sábado), igual que dia_semana en la base.
function diaSemana(fecha) {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

// Primera franja de una hora del día indicado, o null si la cancha no atiende ese día o el horario es menor a 1 hora.
// "desplazamientoHoras" permite pedir una franja posterior dentro del mismo horario (0 = la primera).
function franjaDeUnaHora(horarios, fecha, desplazamientoHoras = 0) {
  const horario = horarios.find((h) => h.diaSemana === diaSemana(fecha));
  if (!horario) return null;
  const inicio = aMinutos(horario.horaInicio) + desplazamientoHoras * 60;
  if (inicio + 60 > aMinutos(horario.horaFin)) return null;
  return { fecha, horaInicio: deMinutos(inicio), horaFin: deMinutos(inicio + 60) };
}

// Recorre las canchas hasta encontrar una que cumpla "condicion(horarios)". Devuelve { cancha, horarios } o null.
async function elegirCancha(llamar, token, canchas, condicion, maximo = 40) {
  for (const cancha of canchas.slice(0, maximo)) {
    const detalle = await llamar('GET', `/canchas/${cancha.id}`, null, token);
    const horarios = detalle.datos.cancha?.horarios ?? detalle.datos.horarios ?? [];
    if (detalle.status === 200 && condicion(horarios)) return { cancha, horarios };
  }
  return null;
}

module.exports = { aMinutos, deMinutos, diaSemana, franjaDeUnaHora, elegirCancha };
