import axiosClient from './axiosClient';

// US-27: perfil, contraseña y correo del propio usuario.
export function obtenerPerfil(usuarioId) {
  return axiosClient.get(`/usuarios/${usuarioId}`);
}

export function actualizarPerfil(usuarioId, { nombre, telefono }) {
  return axiosClient.patch(`/usuarios/${usuarioId}`, { nombre, telefono });
}

export function cambiarPassword(usuarioId, { passwordActual, nuevaPassword }) {
  return axiosClient.patch(`/usuarios/${usuarioId}/password`, { passwordActual, nuevaPassword });
}

export function solicitarCambioCorreo(usuarioId, { nuevoCorreo }) {
  return axiosClient.post(`/usuarios/${usuarioId}/correo`, { nuevoCorreo });
}

// US-28: tarjetas. El número y el CVV solo viajan en agregarMetodoPago y nunca se guardan en el navegador.
export function listarMetodosPago(usuarioId) {
  return axiosClient.get(`/usuarios/${usuarioId}/metodos-pago`);
}

export function agregarMetodoPago(usuarioId, { numero, titular, vencimientoMes, vencimientoAnio, cvv }) {
  return axiosClient.post(`/usuarios/${usuarioId}/metodos-pago`, { numero, titular, vencimientoMes, vencimientoAnio, cvv });
}

export function eliminarMetodoPago(usuarioId, metodoId) {
  return axiosClient.delete(`/usuarios/${usuarioId}/metodos-pago/${metodoId}`);
}
