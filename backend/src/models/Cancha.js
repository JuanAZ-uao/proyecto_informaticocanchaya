const TABLA = 'canchas';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    zona: fila.zona,
    costoHora: fila.costo_hora,
    disponible: fila.disponible,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

module.exports = { TABLA, aDominio };
