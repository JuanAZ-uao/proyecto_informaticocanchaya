import axiosClient from './axiosClient';

export function registrarUsuario({ nombre, correo, telefono, password }) {
  return axiosClient.post('/auth/registro', { nombre, correo, telefono, password });
}

export function iniciarSesion({ correo, password }) {
  return axiosClient.post('/auth/login', { correo, password });
}

export function solicitarRecuperacion({ correo }) {
  return axiosClient.post('/auth/olvide-password', { correo });
}

export function restablecerPassword({ token, nuevaPassword }) {
  return axiosClient.post('/auth/restablecer-password', { token, nuevaPassword });
}
