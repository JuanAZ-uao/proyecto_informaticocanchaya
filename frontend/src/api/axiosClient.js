import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const axiosClient = axios.create({
  baseURL: API_URL,
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('canchaya_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let redirigiendoPorSesionExpirada = false;

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const esRutaAuth = error.config?.url?.startsWith('/auth');
    const estabaAutenticado = Boolean(localStorage.getItem('canchaya_token'));

    if (error.response?.status === 401 && !esRutaAuth && estabaAutenticado && !redirigiendoPorSesionExpirada) {
      redirigiendoPorSesionExpirada = true;
      localStorage.removeItem('canchaya_token');
      localStorage.removeItem('canchaya_usuario');

      const rutaActual = window.location.pathname + window.location.search;
      window.location.assign(`/login?redirect=${encodeURIComponent(rutaActual)}`);
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
