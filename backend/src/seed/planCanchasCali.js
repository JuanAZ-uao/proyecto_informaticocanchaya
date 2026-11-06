// Lógica del seed de canchas adicionales de Cali. Solo AGREGA: nunca borra ni modifica canchas existentes, y se
// puede repetir sin duplicar nada (las canchas ya creadas se detectan por su nombre).
const { canchasCali, PATRONES_HORARIO } = require('./catalogoCanchasCali');

// Horario semanal de una cancha según el patrón que le toca (rotativo por su posición en el catálogo).
function horariosDeCancha(canchaId, indice) {
  const patron = PATRONES_HORARIO[indice % PATRONES_HORARIO.length];

  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    const [horaInicio, horaFin] = esFinDeSemana ? patron.finDeSemana : patron.semana;

    return { canchaId, diaSemana, horaInicio, horaFin };
  });
}

function seleccionarNuevas(catalogo, nombresExistentes) {
  const existentes = new Set(nombresExistentes);
  return catalogo.filter((cancha) => !existentes.has(cancha.nombre));
}

async function sembrarCanchasCali({ canchaRepository, horarioRepository, catalogo = canchasCali }) {
  const nombres = catalogo.map((cancha) => cancha.nombre);

  const nuevas = seleccionarNuevas(catalogo, await canchaRepository.listarNombres(nombres));
  const creadas = nuevas.length > 0 ? await canchaRepository.crearMuchas(nuevas) : [];

  // Se completa el horario de toda cancha del catálogo que no lo tenga. Así, si una ejecución anterior se
  // interrumpió entre crear las canchas y sus horarios, volver a correr el script lo termina.
  const sinHorario = await canchaRepository.listarSinHorarioPorNombres(nombres);
  for (const cancha of sinHorario) {
    await horarioRepository.crearMuchos(horariosDeCancha(cancha.id, nombres.indexOf(cancha.nombre)));
  }

  return { creadas: creadas.length, yaExistian: catalogo.length - nuevas.length, conHorarioNuevo: sinHorario.length };
}

module.exports = { horariosDeCancha, seleccionarNuevas, sembrarCanchasCali };
