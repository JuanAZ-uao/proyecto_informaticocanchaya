import axiosClient from './axiosClient';

export function obtenerMisReservas({ periodo = 'proximas', estado, pagina = 1, limite = 10 } = {}) {
  const params = { periodo, pagina, limite };

  if (estado) params.estado = estado;

  return axiosClient.get('/reservas', { params });
}

// US-14: cancela una reserva propia. Responde { reserva, reembolso } (reembolso es null si no se había pagado con tarjeta).
export function cancelarReserva(id) {
  return axiosClient.patch(`/reservas/${id}/cancelar`);
}
