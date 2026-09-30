const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const canchasSemilla = require('./catalogoCanchas');

function generarHorariosSemana(canchaId) {
  const horaEntreSemana = ['06:00', '22:00'];
  const horaFinDeSemana = ['07:00', '20:00'];

  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    const [horaInicio, horaFin] = esFinDeSemana ? horaFinDeSemana : horaEntreSemana;

    return { canchaId, diaSemana, horaInicio, horaFin };
  });
}

async function ejecutarSeed() {
  await canchaRepository.eliminarTodas();
  const canchasCreadas = await canchaRepository.crearMuchas(canchasSemilla);

  for (const cancha of canchasCreadas) {
    await horarioRepository.crearMuchos(generarHorariosSemana(cancha.id));
  }

  console.log(`[SEED] Se insertaron ${canchasCreadas.length} canchas de ejemplo con sus horarios`);
  await pool.end();
  process.exit(0);
}

ejecutarSeed().catch((error) => {
  console.error('[SEED] Error al ejecutar el seed:', error);
  process.exit(1);
});
