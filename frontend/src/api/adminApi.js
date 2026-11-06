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
