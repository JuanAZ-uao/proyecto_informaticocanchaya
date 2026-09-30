// Completa foto, descripción, tipo y servicios de las canchas existentes sin borrar
// nada (a diferencia de seedCanchas.js, que elimina todas las canchas y sus reservas).
const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const catalogoCanchas = require('./catalogoCanchas');

async function enriquecer() {
  for (const cancha of catalogoCanchas) {
    const filas = await canchaRepository.actualizarPresentacionPorNombre(cancha.nombre, cancha);
    console.log(`[ENRIQUECER] ${cancha.nombre}: ${filas ? 'actualizada' : 'no encontrada'}`);
  }

  await pool.end();
  process.exit(0);
}

enriquecer().catch((error) => {
  console.error('[ENRIQUECER] Error:', error);
  process.exit(1);
});
