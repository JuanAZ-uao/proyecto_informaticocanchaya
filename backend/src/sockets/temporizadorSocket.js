const { verificarToken } = require('../utils/jwt');
const temporizadorService = require('../services/temporizadorReservaService');

function salaDe(usuarioId, canchaId) {
  return `temporizador:${usuarioId}:${canchaId}`;
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

  io.on('connection', (socket) => {
    const canchaId = socket.handshake.query?.canchaId;

    if (!canchaId || typeof canchaId !== 'string') {
      socket.emit('temporizador:error', { mensaje: 'Falta el id de la cancha' });
      socket.disconnect(true);
      return;
    }

    const sala = salaDe(socket.usuarioId, canchaId);
    socket.join(sala);

    const sesion = temporizadorService.iniciarOTomarSesion(socket.usuarioId, canchaId);
    temporizadorService.registrarSocket(socket.usuarioId, canchaId, socket.id);

    socket.emit('temporizador:inicio', { expiresAt: sesion.expiresAt, estado: sesion.estado });

    socket.on('temporizador:reiniciar', (_datos, ack) => {
      temporizadorService.cancelarSesion(socket.usuarioId, canchaId);
      const nuevaSesion = temporizadorService.iniciarOTomarSesion(socket.usuarioId, canchaId);

      const socketsEnSala = io.sockets.adapter.rooms.get(sala) || [];
      socketsEnSala.forEach((socketId) =>
        temporizadorService.registrarSocket(socket.usuarioId, canchaId, socketId)
      );

      io.to(sala).emit('temporizador:inicio', {
        expiresAt: nuevaSesion.expiresAt,
        estado: nuevaSesion.estado,
      });

      if (typeof ack === 'function') {
        ack({ expiresAt: nuevaSesion.expiresAt });
      }
    });

    socket.on('disconnect', () => {
      temporizadorService.quitarSocket(socket.usuarioId, canchaId, socket.id);
    });
  });

  temporizadorService.eventos.on('sync', ({ key, expiresAt }) => {
    io.to(`temporizador:${key}`).emit('temporizador:sync', { expiresAt });
  });

  temporizadorService.eventos.on('expirado', ({ key }) => {
    io.to(`temporizador:${key}`).emit('temporizador:expirado');
  });
}

module.exports = registrarTemporizadorSocket;
