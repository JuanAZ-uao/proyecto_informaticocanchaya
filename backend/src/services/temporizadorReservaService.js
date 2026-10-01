const { EventEmitter } = require('events');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');
const sesionRepository = require('../repositories/sesionReservaRepository');

const DURACION_MS = 180000;
const INTERVALO_SYNC_MS = 5000;

// La fuente de verdad de cada sesión es la tabla sesiones_reserva (US-18: sobrevive a
// un reinicio del servidor). En memoria solo viven los timers y los sockets conectados.
const sesiones = new Map();
const eventos = new EventEmitter();

function clave(usuarioId, canchaId) {
  return `${usuarioId}:${canchaId}`;
}

function detenerTimers(sesion) {
  clearTimeout(sesion.timeoutExpiracion);
  clearInterval(sesion.intervaloSync);
}

function registrarError(contexto) {
  return (error) => console.error(`[TEMPORIZADOR] ${contexto}:`, error.message);
}

function programarExpiracion(key, sesion) {
  sesion.timeoutExpiracion = setTimeout(() => {
    clearInterval(sesion.intervaloSync);
    sesiones.delete(key);
    eventos.emit('expirado', { key });
    eventos.emit('terminada', { usuarioId: sesion.usuarioId, canchaId: sesion.canchaId, motivo: 'expirada' });
    sesionRepository
      .eliminar(sesion.usuarioId, sesion.canchaId)
      .catch(registrarError('No se pudo eliminar la sesión expirada'));
  }, Math.max(0, sesion.expiresAt - Date.now()));
}

function programarSync(key, sesion) {
  sesion.intervaloSync = setInterval(() => {
    eventos.emit('sync', { key, expiresAt: sesion.expiresAt });
  }, INTERVALO_SYNC_MS);
}

function activarEnMemoria(usuarioId, canchaId, expiresAt, sockets = new Set()) {
  const key = clave(usuarioId, canchaId);
  const sesion = { usuarioId, canchaId, expiresAt, estado: 'activo', sockets };

  sesiones.set(key, sesion);
  programarExpiracion(key, sesion);
  programarSync(key, sesion);
  return sesion;
}

function sesionVigente(sesion) {
  return sesion && sesion.estado === 'activo' && sesion.expiresAt > Date.now();
}

async function iniciarOTomarSesion(usuarioId, canchaId) {
  const key = clave(usuarioId, canchaId);
  const enMemoria = sesiones.get(key);
  if (sesionVigente(enMemoria)) return enMemoria;

  // Tras un reinicio del servidor la sesión sigue guardada: se retoma con el mismo expiresAt.
  const guardada = await sesionRepository.obtener(usuarioId, canchaId);
  let expiresAt = sesionVigente(guardada) ? guardada.expiresAt : null;

  if (!expiresAt) {
    expiresAt = Date.now() + DURACION_MS;
    await sesionRepository.guardar({ usuarioId, canchaId, expiresAt, estado: 'activo' });
  }

  // Otra conexión del mismo usuario pudo crear la sesión mientras se consultaba la base.
  const actual = sesiones.get(key);
  if (sesionVigente(actual)) return actual;
  if (actual) detenerTimers(actual);

  return activarEnMemoria(usuarioId, canchaId, expiresAt, actual?.sockets);
}

function obtenerSesion(usuarioId, canchaId) {
  return sesiones.get(clave(usuarioId, canchaId)) ?? null;
}

function registrarSocket(usuarioId, canchaId, socketId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));
  if (sesion) sesion.sockets.add(socketId);
}

async function quitarSocket(usuarioId, canchaId, socketId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));
  if (!sesion) return;

  sesion.sockets.delete(socketId);
  if (sesion.sockets.size === 0) {
    await cancelarSesion(usuarioId, canchaId, 'salio');
  }
}

async function cancelarSesion(usuarioId, canchaId, motivo = 'cancelada') {
  const key = clave(usuarioId, canchaId);
  const sesion = sesiones.get(key);

  if (sesion) {
    detenerTimers(sesion);
    sesiones.delete(key);
  }

  eventos.emit('terminada', { usuarioId, canchaId, motivo });
  await sesionRepository.eliminar(usuarioId, canchaId);
}

async function completarSesion(usuarioId, canchaId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));

  if (!sesion || (sesion.estado === 'activo' && sesion.expiresAt <= Date.now())) {
    throw new ErrorDeAplicacion(
      'Tu tiempo para reservar expiró. Reinicia el temporizador para continuar.',
      409,
      'SESION_EXPIRADA'
    );
  }

  // Idempotente: si el usuario retrocede ("Cambiar horario") y vuelve a entrar
  // al panel dentro de la misma sesión ya completada, no debe rechazarse.
  if (sesion.estado === 'activo') {
    sesion.estado = 'completado';
    detenerTimers(sesion);
    await sesionRepository.actualizarEstado(usuarioId, canchaId, 'completado');
  }

  return { estado: sesion.estado };
}

// Al confirmar una reserva (US-11) la sesión deja de contar. A diferencia de
// completarSesion, no falla si ya no había sesión (p. ej. la pestaña se cerró).
async function finalizarSesion(usuarioId, canchaId) {
  const sesion = sesiones.get(clave(usuarioId, canchaId));
  if (!sesion || sesion.estado !== 'activo') return;

  sesion.estado = 'completado';
  detenerTimers(sesion);
  await sesionRepository.actualizarEstado(usuarioId, canchaId, 'completado');
}

// Al arrancar el servidor: retoma los timers de las sesiones que siguen vigentes en la
// base y descarta las vencidas. Los clientes se reconectan solos (Socket.IO) y reciben
// el mismo expiresAt que tenían antes del reinicio.
async function restaurarSesiones() {
  await sesionRepository.eliminarVencidas();
  const vigentes = await sesionRepository.listarActivasVigentes();

  vigentes.forEach(({ usuarioId, canchaId, expiresAt }) => {
    if (!sesiones.has(clave(usuarioId, canchaId))) {
      activarEnMemoria(usuarioId, canchaId, expiresAt);
    }
  });

  return vigentes.length;
}

module.exports = {
  DURACION_MS,
  iniciarOTomarSesion,
  obtenerSesion,
  registrarSocket,
  quitarSocket,
  cancelarSesion,
  completarSesion,
  finalizarSesion,
  restaurarSesiones,
  eventos,
};
