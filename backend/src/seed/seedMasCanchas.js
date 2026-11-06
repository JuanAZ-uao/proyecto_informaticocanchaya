// Agrega más canchas de ejemplo en Cali (con sus horarios) SIN borrar nada. Se puede ejecutar varias veces.
//   npm run seed:mas-canchas
//   En Docker: docker compose exec backend node src/seed/seedMasCanchas.js
// (A diferencia de seedCanchas.js, que reemplaza todo el catálogo y, por la cascada, también las reservas.)
const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const { sembrarCanchasCali } = require('./planCanchasCali');

async function ejecutar() {
  const antes = await canchaRepository.contar();
  const resultado = await sembrarCanchasCali({ canchaRepository, horarioRepository });
  const despues = await canchaRepository.contar();

  console.log(`[SEED] Canchas nuevas: ${resultado.creadas} · ya existían: ${resultado.yaExistian} · con horario completado: ${resultado.conHorarioNuevo}`);
  console.log(`[SEED] Total de canchas en la base: ${antes} → ${despues}`);
}

ejecutar()
  .catch((error) => {
    console.error('[SEED] Error al agregar las canchas:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
