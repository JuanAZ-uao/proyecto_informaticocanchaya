const TABLA = 'canchas';

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    zona: fila.zona,
    disponible: fila.disponible,
    costoHora: Number(fila.costo_hora),
    imagenUrl: fila.imagen_url ?? null,
    imagenCredito: fila.imagen_credito ?? null,
    descripcion: fila.descripcion ?? null,
    tipo: fila.tipo ?? null,
    servicios: fila.servicios ?? [],
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

module.exports = { TABLA, aDominio };
