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

export function obtenerBloquesOcupados(id, fecha) {
  return axiosClient.get(`/canchas/${id}/reservas`, { params: { fecha } });
}

<<<<<<< HEAD
export function confirmarReserva(id, { fecha, horaInicio, horaFin }) {
=======
export function crearReserva(id, { fecha, horaInicio, horaFin }) {
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
  return axiosClient.post(`/canchas/${id}/reservas`, { fecha, horaInicio, horaFin });
}
