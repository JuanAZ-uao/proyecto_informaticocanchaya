const TABLA = 'usuarios';
const ROL_USUARIO = 'usuario';
const ROL_ADMINISTRADOR = 'administrador';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    telefono: fila.telefono,
    passwordHash: fila.password_hash,
    rol: fila.rol || ROL_USUARIO,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

module.exports = { TABLA, ROL_USUARIO, ROL_ADMINISTRADOR, aDominio };
