import axiosClient from './axiosClient';

export function obtenerCanchas() {
  return axiosClient.get('/canchas');
}
