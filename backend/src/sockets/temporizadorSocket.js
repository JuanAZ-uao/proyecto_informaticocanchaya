const { verificarToken } = require('../utils/jwt');
const temporizadorService = require('../services/temporizadorReservaService');
const retencionService = require('../services/retencionService');

// Cada cierto tiempo se eliminan las retenciones vencidas que no se liberaron por un
// timer (p. ej. tras un reinicio del servidor) y se avisa a quienes miran la cancha.
const INTERVALO_BARRIDO_MS = 15000;

// Eventos documentados en docs/api/eventos-socket.md
function salaDe(usuarioId, canchaId) {
  return `temporizador:${usuarioId}:${canchaId}`;
}

function salaDeCancha(canchaId) {
  return `cancha:${canchaId}`;
}

function responder(ack, cuerpo) {
  if (typeof ack === 'function') ack(cuerpo);
}

function aErrorSocket(error) {
  if (error.statusCode && error.statusCode < 500) {
    return { codigo: error.codigo || 'SOLICITUD_INVALIDA', mensaje: error.message };
  }
  console.error('[SOCKET]', error);
  return { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' };
}

function registrarTemporizadorSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('No autenticado'));
    }

    try {
      const payload = verificarToken(token);
      socket.usuarioId = payload.sub;
      return next();
    } catch (error) {
      return next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', async (socket) => {
    const canchaId = socket.handshake.query?.canchaId;

    if (!canchaId || typeof canchaId !== 'string') {
      socket.emit('temporizador:error', { mensaje: 'Falta el id de la cancha' });
      socket.disconnect(true);
      return;
    }

    const { usuarioId } = socket;
    const sala = salaDe(usuarioId, canchaId);
    socket.join(sala);
    socket.join(salaDeCancha(canchaId));

    socket.on('temporizador:reiniciar', async (_datos, ack) => {
      try {
        await temporizadorService.cancelarSesion(usuarioId, canchaId, 'reiniciada');
        const nuevaSesion = await temporizadorService.iniciarOTomarSesion(usuarioId, canchaId);

        const socketsEnSala = io.sockets.adapter.rooms.get(sala) || [];
        socketsEnSala.forEach((socketId) => temporizadorService.registrarSocket(usuarioId, canchaId, socketId));

        io.to(sala).emit('temporizador:inicio', { expiresAt: nuevaSesion.expiresAt, estado: nuevaSesion.estado });
        responder(ack, { expiresAt: nuevaSesion.expiresAt });
      } catch (error) {
        responder(ack, { error: aErrorSocket(error) });
      }
    });

    // US-18: retener la franja elegida. La respuesta (ack) confirma o rechaza la retención.
    socket.on('retencion:solicitar', async (franja, ack) => {
      try {
        const retencion = await retencionService.retenerFranja(usuarioId, canchaId, franja);
        const confirmada = {
          fecha: retencion.fecha,
          horaInicio: retencion.horaInicio,
          horaFin: retencion.horaFin,
          expiresAt: retencion.expiresAt,
        };
        io.to(sala).emit('retencion:confirmada', confirmada);
        responder(ack, { ok: true, retencion: confirmada });
      } catch (error) {
        responder(ack, { ok: false, error: aErrorSocket(error) });
      }
    });

    socket.on('retencion:liberar', async (_datos, ack) => {
      try {
        await retencionService.liberarFranja(usuarioId, canchaId);
        responder(ack, { ok: true });
      } catch (error) {
        responder(ack, { ok: false, error: aErrorSocket(error) });
      }
    });

    socket.on('disconnect', () => {
      temporizadorService
        .quitarSocket(usuarioId, canchaId, socket.id)
        .catch((error) => console.error('[SOCKET] Error al cerrar la sesión:', error.message));
    });

    try {
      const sesion = await temporizadorService.iniciarOTomarSesion(usuarioId, canchaId);
      temporizadorService.registrarSocket(usuarioId, canchaId, socket.id);
      socket.emit('temporizador:inicio', { expiresAt: sesion.expiresAt, estado: sesion.estado });
    } catch (error) {
      socket.emit('temporizador:error', aErrorSocket(error));
    }
  });

  temporizadorService.eventos.on('sync', ({ key, expiresAt }) => {
    io.to(`temporizador:${key}`).emit('temporizador:sync', { expiresAt });
  });

  temporizadorService.eventos.on('expirado', ({ key }) => {
    io.to(`temporizador:${key}`).emit('temporizador:expirado');
  });

  // A quienes miran la cancha se les avisa del cambio; a las pestañas del propio usuario no,
  // porque ellas ya conocen su selección.
  const reenviar = (eventoInterno, eventoSocket) => {
    retencionService.eventos.on(eventoInterno, ({ usuarioId, franja }) => {
      io.to(salaDeCancha(franja.canchaId)).except(salaDe(usuarioId, franja.canchaId)).emit(eventoSocket, franja);
    });
  };
  reenviar('retenida', 'disponibilidad:retenida');
  reenviar('liberada', 'disponibilidad:liberada');
  reenviar('reservada', 'disponibilidad:reservada');

  const barrido = setInterval(() => {
    retencionService
      .barrerVencidas()
      .catch((error) => console.error('[SOCKET] Error al barrer retenciones vencidas:', error.message));
  }, INTERVALO_BARRIDO_MS);
  barrido.unref();
}

module.exports = registrarTemporizadorSocket;
