// US-15: el formulario de una cancha edita el horario como una fila por día; la API espera una lista de
// { diaSemana, horaInicio, horaFin } solo con los días en que la cancha abre.
export const DIAS_SEMANA = [
  { diaSemana: 1, etiqueta: 'Lunes' },
  { diaSemana: 2, etiqueta: 'Martes' },
  { diaSemana: 3, etiqueta: 'Miércoles' },
  { diaSemana: 4, etiqueta: 'Jueves' },
  { diaSemana: 5, etiqueta: 'Viernes' },
  { diaSemana: 6, etiqueta: 'Sábado' },
  { diaSemana: 0, etiqueta: 'Domingo' },
];

export const TIPOS_CANCHA = ['Fútbol 5', 'Fútbol 6', 'Fútbol 7', 'Fútbol 8', 'Fútbol 11'];

const HORA_POR_DEFECTO = { inicio: '08:00', fin: '20:00' };

// Estado inicial del formulario: nueva cancha (abre de lunes a viernes) o los horarios que ya tiene la cancha.
export function estadoHorarios(horarios) {
  const porDia = new Map((horarios ?? []).map((h) => [h.diaSemana, h]));
  const esNueva = horarios === undefined || horarios === null;

  return Object.fromEntries(
    DIAS_SEMANA.map(({ diaSemana }) => {
      const existente = porDia.get(diaSemana);
      const abre = existente ? true : esNueva && diaSemana >= 1 && diaSemana <= 5;

      return [
        diaSemana,
        { abre, inicio: existente?.horaInicio?.slice(0, 5) ?? HORA_POR_DEFECTO.inicio, fin: existente?.horaFin?.slice(0, 5) ?? HORA_POR_DEFECTO.fin },
      ];
    })
  );
}

export function aListaHorarios(estado) {
  return DIAS_SEMANA.filter(({ diaSemana }) => estado[diaSemana]?.abre).map(({ diaSemana }) => ({
    diaSemana,
    horaInicio: estado[diaSemana].inicio,
    horaFin: estado[diaSemana].fin,
  }));
}

// Mensaje de error de los horarios antes de enviar (el servidor vuelve a validar todo); null si están bien.
export function errorDeHorarios(estado) {
  const lista = aListaHorarios(estado);
  if (lista.length === 0) return 'Define al menos un día de atención';

  for (const horario of lista) {
    const dia = DIAS_SEMANA.find((d) => d.diaSemana === horario.diaSemana).etiqueta;
    if (!horario.horaInicio || !horario.horaFin) return `${dia}: indica la hora de apertura y la de cierre`;
    if (horario.horaFin <= horario.horaInicio) return `${dia}: la hora de cierre debe ser posterior a la de apertura`;
  }

  return null;
}
