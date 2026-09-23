import axiosClient from './axiosClient';

export function obtenerCanchas() {
  return axiosClient.get('/canchas');
}

export function obtenerCanchaPorId(id) {
  return axiosClient.get(`/canchas/${id}`);
}
