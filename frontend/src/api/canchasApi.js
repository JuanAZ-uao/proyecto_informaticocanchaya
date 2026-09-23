import axiosClient from './axiosClient';

export function obtenerCanchas(filtros = {}) {
  const params = {};

  if (filtros.zona) params.zona = filtros.zona;
  if (filtros.precioMin) params.precioMin = filtros.precioMin;
  if (filtros.precioMax) params.precioMax = filtros.precioMax;
  if (filtros.fecha) params.fecha = filtros.fecha;

  return axiosClient.get('/canchas', { params });
}

export function obtenerCanchaPorId(id) {
  return axiosClient.get(`/canchas/${id}`);
}
