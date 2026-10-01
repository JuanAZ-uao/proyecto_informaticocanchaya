export const formateadorMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const formateadorFechaLarga = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// fecha en formato 'YYYY-MM-DD' -> "jueves, 1 de octubre de 2026"
export function formatearFechaLarga(fecha) {
  return formateadorFechaLarga.format(new Date(`${fecha}T00:00:00`));
}

// '18:00:00' -> '18:00'
export function formatearHora(hora) {
  return hora?.slice(0, 5) ?? hora;
}
