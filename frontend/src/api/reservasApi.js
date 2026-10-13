import axiosClient from './axiosClient';

export function obtenerMisReservas({ periodo = 'proximas', estado, pagina = 1, limite = 10 } = {}) {
  const params = { periodo, pagina, limite };

  if (estado) params.estado = estado;

  return axiosClient.get('/reservas', { params });
}