const TABLA = 'usuarios';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    correo: fila.correo,
    telefono: fila.telefono,
    passwordHash: fila.password_hash,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

module.exports = { TABLA, aDominio };
