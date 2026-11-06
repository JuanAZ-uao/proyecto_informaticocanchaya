// Las canchas están en Cali: las fechas y horas de reserva se interpretan en hora de
// Colombia (UTC-5, sin horario de verano), sin importar la zona del servidor.
const DESFASE_COLOMBIA = '-05:00';

function aMomentoColombia(fecha, hora) {
  return new Date(`${fecha}T${hora}:00${DESFASE_COLOMBIA}`);
}

function esMomentoPasado(fecha, hora, ahora = Date.now()) {
  const momento = aMomentoColombia(fecha, hora);
  return Number.isNaN(momento.getTime()) || momento.getTime() <= ahora;
}

// Minutos que faltan para el inicio de la reserva (negativo si ya comenzó). NaN si la fecha no es válida.
function minutosHastaInicio(fecha, hora, ahora = Date.now()) {
  return (aMomentoColombia(fecha, hora).getTime() - ahora) / 60000;
}

module.exports = { aMomentoColombia, esMomentoPasado, minutosHastaInicio };
