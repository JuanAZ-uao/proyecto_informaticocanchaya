// Carga inicial de producción (US-23): inserta el catálogo de canchas con sus horarios SOLO si la tabla está vacía.
// A diferencia de seedCanchas.js, nunca borra nada, así que puede ejecutarse en cada despliegue sin perder datos.
//
//   npm run seed:inicial
//
// El usuario administrador no se crea aquí (no hay credenciales por defecto): se crea una vez con
//   ADMIN_PASSWORD='...' npm run crear:admin -- correo@ejemplo.com "Nombre"
const pool = require('../config/db');
const canchaRepository = require('../repositories/canchaRepository');
const horarioRepository = require('../repositories/horarioRepository');
const canchasSemilla = require('./catalogoCanchas');

function generarHorariosSemana(canchaId) {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    return { canchaId, diaSemana, horaInicio: esFinDeSemana ? '07:00' : '06:00', horaFin: esFinDeSemana ? '20:00' : '22:00' };
  });
}

async function cargarCatalogoInicial() {
  const existentes = await canchaRepository.contar();
  if (existentes > 0) {
    console.log(`[SEED] Ya hay ${existentes} canchas: no se inserta nada`);
    return 0;
  }

  const canchasCreadas = await canchaRepository.crearMuchas(canchasSemilla);
  for (const cancha of canchasCreadas) {
    await horarioRepository.crearMuchos(generarHorariosSemana(cancha.id));
  }
  console.log(`[SEED] Catálogo inicial cargado: ${canchasCreadas.length} canchas con sus horarios`);
  return canchasCreadas.length;
}

cargarCatalogoInicial()
  .catch((error) => {
    console.error('[SEED] Error al cargar el catálogo inicial:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
