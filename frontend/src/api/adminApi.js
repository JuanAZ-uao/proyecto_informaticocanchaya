import axiosClient from './axiosClient';

// US-29: verificación del código de reserva (solo administradores).
export function verificarCodigoReserva(codigo) {
  return axiosClient.post('/admin/reservas/verificar', { codigo });
}

export function marcarReservaUsada(codigo) {
  return axiosClient.post(`/admin/reservas/${encodeURIComponent(codigo)}/usar`);
}

export function listarVerificaciones(limite = 20) {
  return axiosClient.get('/admin/verificaciones', { params: { limite } });
}

// US-16: reservas futuras de cualquier usuario, filtradas por cancha, fecha o usuario.
export function obtenerReservasAdmin({ canchaId, fecha, usuario, pagina = 1, limite = 20 } = {}) {
  const params = { pagina, limite };

  if (canchaId) params.canchaId = canchaId;
  if (fecha) params.fecha = fecha;
  if (usuario?.trim()) params.usuario = usuario.trim();

  return axiosClient.get('/admin/reservas', { params });
}

// US-16: el motivo es obligatorio y llega al usuario por correo.
export function cancelarReservaAdmin(id, motivo) {
  return axiosClient.patch(`/admin/reservas/${id}/cancelar`, { motivo });
}
