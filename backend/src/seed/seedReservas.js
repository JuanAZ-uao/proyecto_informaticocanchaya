const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const reservaRepository = require('../repositories/reservaRepository');

function hoyISO() {
  const hoy = new Date();
  const offset = hoy.getTimezoneOffset() * 60000;
  return new Date(hoy - offset).toISOString().slice(0, 10);
}

async function ejecutarSeed() {
  const { rows: usuarios } = await pool.query('SELECT id FROM usuarios ORDER BY created_at ASC LIMIT 1');

  if (usuarios.length === 0) {
    console.log('[SEED] No hay usuarios registrados todavía: registra una cuenta y vuelve a correr este seed.');
    await pool.end();
    process.exit(0);
  }

  const usuarioId = usuarios[0].id;
  const canchas = await canchaRepository.listarDisponibles();

  if (canchas.length === 0) {
    console.log('[SEED] No hay canchas: corre primero "npm run seed:canchas".');
    await pool.end();
    process.exit(0);
  }

  const fecha = hoyISO();
  const primeraCancha = canchas[0];

  await reservaRepository.crear({
    canchaId: primeraCancha.id,
    usuarioId,
    fecha,
    horaInicio: '08:00',
    horaFin: '09:00',
  });

  await reservaRepository.crear({
    canchaId: primeraCancha.id,
    usuarioId,
    fecha,
    horaInicio: '18:00',
    horaFin: '19:00',
  });

  console.log(
    `[SEED] Se ocuparon los bloques 08:00-09:00 y 18:00-19:00 de "${primeraCancha.nombre}" para hoy (${fecha})`
  );
  await pool.end();
  process.exit(0);
}

ejecutarSeed().catch((error) => {
  console.error('[SEED] Error al ejecutar el seed de reservas:', error.message);
  process.exit(1);
});
