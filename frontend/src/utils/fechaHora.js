// Igual que el backend: las reservas se manejan en hora de Colombia (UTC-5, sin horario de verano),
// así la disponibilidad que ve el usuario coincide con la que valida el servidor.
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

export function obtenerFechaHoyColombia(ahora = Date.now()) {
  return new Date(ahora - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}

export function esBloquePasado(fecha, horaInicio, ahora = Date.now()) {
  const momento = Date.parse(`${fecha}T${horaInicio}:00-05:00`);
  return Number.isNaN(momento) || momento <= ahora;
}
