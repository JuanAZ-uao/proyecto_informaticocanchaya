const TABLA = 'reservas';

// pg convierte las columnas DATE en un Date a medianoche local; se devuelve como
// 'YYYY-MM-DD' para que la fecha no se corra al serializar en JSON (UTC).
function formatearFecha(fecha) {
  if (!(fecha instanceof Date)) return fecha;

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Código corto y legible para mostrar al usuario (derivado del UUID de la reserva).
function codigoReserva(id) {
  return `CY-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function aDominio(fila) {
  if (!fila) return null;

  return {
    id: fila.id,
    codigo: codigoReserva(fila.id),
    canchaId: fila.cancha_id,
    usuarioId: fila.usuario_id,
    fecha: formatearFecha(fila.fecha),
    horaInicio: fila.hora_inicio,
    horaFin: fila.hora_fin,
    estado: fila.estado,
    createdAt: fila.created_at,
  };
}

module.exports = { TABLA, aDominio, codigoReserva, formatearFecha };
