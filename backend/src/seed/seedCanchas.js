const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');

const canchasSemilla = [
  { nombre: 'Cancha Los Cerros', direccion: 'Cra 15 # 45-20, Cali', zona: 'Norte', costoHora: 80000, disponible: true },
  { nombre: 'Cancha El Bosque', direccion: 'Av. Roosevelt # 30-10, Cali', zona: 'Oeste', costoHora: 70000, disponible: true },
  { nombre: 'Cancha La Rivera', direccion: 'Cra 8 # 12-50, Cali', zona: 'Centro', costoHora: 65000, disponible: true },
  { nombre: 'Cancha Santa Mónica', direccion: 'Calle 5 # 38-60, Cali', zona: 'Sur', costoHora: 90000, disponible: true },
  { nombre: 'Cancha San Fernando', direccion: 'Cra 24 # 3-15, Cali', zona: 'Sur', costoHora: 75000, disponible: true },
];

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
