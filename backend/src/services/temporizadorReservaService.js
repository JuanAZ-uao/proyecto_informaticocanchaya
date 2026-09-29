const { EventEmitter } = require('events');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const DURACION_MS = 180000;
const INTERVALO_SYNC_MS = 5000;

const sesiones = new Map();
const eventos = new EventEmitter();

function clave(usuarioId, canchaId) {
  return `${usuarioId}:${canchaId}`;
}

function programarExpiracion(key, sesion) {
  sesion.timeoutExpiracion = setTimeout(() => {
    clearInterval(sesion.intervaloSync);
    sesiones.delete(key);
    eventos.emit('expirado', { key });
  }, sesion.expiresAt - Date.now());
}

function programarSync(key, sesion) {
  sesion.intervaloSync = setInterval(() => {
    eventos.emit('sync', { key, expiresAt: sesion.expiresAt });
  }, INTERVALO_SYNC_MS);
}

function iniciarOTomarSesion(usuarioId, canchaId) {
  const key = clave(usuarioId, canchaId);
  const existente = sesiones.get(key);

  if (existente && existente.estado === 'activo') {
    return existente;
  }

  const sesion = {
    usuarioId,
    canchaId,
    expiresAt: Date.now() + DURACION_MS,
    estado: 'activo',
    sockets: new Set(),
  };

  sesiones.set(key, sesion);
  programarExpiracion(key, sesion);
  programarSync(key, sesion);

  return sesion;
}

function registrarSocket(usuarioId, canchaId, socketId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));
  if (sesion) sesion.sockets.add(socketId);
}

function quitarSocket(usuarioId, canchaId, socketId) {
  const key = clave(usuarioId, canchaId);
  const sesion = sesiones.get(key);
  if (!sesion) return;

  sesion.sockets.delete(socketId);
  if (sesion.sockets.size === 0) {
    cancelarSesion(usuarioId, canchaId);
  }
}

function cancelarSesion(usuarioId, canchaId) {
  const key = clave(usuarioId, canchaId);
  const sesion = sesiones.get(key);
  if (!sesion) return;

  clearTimeout(sesion.timeoutExpiracion);
  clearInterval(sesion.intervaloSync);
  sesiones.delete(key);
}

function completarSesion(usuarioId, canchaId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));

  if (!sesion || sesion.expiresAt <= Date.now()) {
    throw new ErrorDeAplicacion(
      'Tu tiempo para reservar expiró. Reinicia el temporizador para continuar.',
      409
    );
  }

  // Idempotente: si el usuario retrocede ("Cambiar horario") y vuelve a entrar
  // al panel dentro de la misma sesión ya completada, no debe rechazarse.
  if (sesion.estado === 'activo') {
    sesion.estado = 'completado';
    clearTimeout(sesion.timeoutExpiracion);
    clearInterval(sesion.intervaloSync);
  }

  return { estado: sesion.estado };
}

module.exports = {
  DURACION_MS,
  iniciarOTomarSesion,
  registrarSocket,
  quitarSocket,
  cancelarSesion,
  completarSesion,
  eventos,
};
