import axiosClient from './axiosClient';

export function obtenerMisReservas() {
  return axiosClient.get('/reservas/mias');
}
