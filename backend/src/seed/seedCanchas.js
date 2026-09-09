const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');

const canchasSemilla = [
  { nombre: 'Cancha Los Cerros', direccion: 'Cra 15 # 45-20, Cali', disponible: true },
  { nombre: 'Cancha El Bosque', direccion: 'Av. Roosevelt # 30-10, Cali', disponible: true },
  { nombre: 'Cancha La Rivera', direccion: 'Cra 8 # 12-50, Cali', disponible: true },
  { nombre: 'Cancha Santa Mónica', direccion: 'Calle 5 # 38-60, Cali', disponible: true },
  { nombre: 'Cancha San Fernando', direccion: 'Cra 24 # 3-15, Cali', disponible: true },
];

async function ejecutarSeed() {
  await canchaRepository.eliminarTodas();
  await canchaRepository.crearMuchas(canchasSemilla);

  console.log(`[SEED] Se insertaron ${canchasSemilla.length} canchas de ejemplo`);
  await pool.end();
  process.exit(0);
}

ejecutarSeed().catch((error) => {
  console.error('[SEED] Error al ejecutar el seed:', error);
  process.exit(1);
});
