// Crea un administrador o promueve a uno existente (US-29). Un administrador nunca se crea desde el
// registro público.
//
//   Promover una cuenta existente:
//     npm run crear:admin -- correo@ejemplo.com
//   Crear una cuenta nueva con rol de administrador (la contraseña va en una variable de entorno, no en el comando):
//     ADMIN_PASSWORD='ClaveSegura123' npm run crear:admin -- correo@ejemplo.com "Nombre Apellido"
//   En Docker:
//     docker compose exec backend node src/seed/crearAdministrador.js correo@ejemplo.com
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const usuarioRepository = require('../repositories/usuarioRepository');
const { cumplePoliticaMinima } = require('../utils/passwordPolicy');

const SALT_ROUNDS = 10;

async function principal() {
  const [correo, nombre] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;

  if (!correo || !/^\S+@\S+\.\S+$/.test(correo)) {
    throw new Error('Uso: npm run crear:admin -- correo@ejemplo.com ["Nombre"]  (ADMIN_PASSWORD solo si la cuenta no existe)');
  }

  const existente = await usuarioRepository.buscarPorCorreo(correo);

  if (existente) {
    await usuarioRepository.asignarRol(existente.id, 'administrador');
    console.log(`[ADMIN] ${existente.correo} ahora es administrador`);
    return;
  }

  if (!cumplePoliticaMinima(password)) {
    throw new Error('La cuenta no existe: defina ADMIN_PASSWORD (mínimo 8 caracteres, una letra y un número) para crearla');
  }

  const usuario = await usuarioRepository.crear({
    nombre: nombre || 'Administrador',
    correo,
    telefono: '0000000',
    passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
  });
  await usuarioRepository.asignarRol(usuario.id, 'administrador');
  console.log(`[ADMIN] Cuenta creada y asignada como administrador: ${usuario.correo}`);
}

principal()
  .catch((error) => {
    console.error('[ADMIN]', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
