// Direcciones del backend. En producción (Vercel) vienen de variables de entorno del proyecto: el código no lleva
// direcciones de desarrollo. Solo en desarrollo (npm run dev, pruebas) se usa localhost como valor de respaldo.
//   VITE_API_URL     https://api.ejemplo.com/api   (obligatoria al compilar en Vercel)
//   VITE_SOCKET_URL  https://api.ejemplo.com       (opcional: por defecto, la de la API sin el sufijo /api)
const respaldoDesarrollo = import.meta.env.DEV ? 'http://localhost:4000/api' : '';

export const API_URL = import.meta.env.VITE_API_URL || respaldoDesarrollo;

export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_URL).replace(/\/api\/?$/, '');
