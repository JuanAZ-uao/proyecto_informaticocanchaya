const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const verificarOrigen = require('./config/corsOrigin');
const registrarTemporizadorSocket = require('./sockets/temporizadorSocket');
const temporizadorService = require('./services/temporizadorReservaService');
require('./config/db');

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: verificarOrigen },
});

registrarTemporizadorSocket(io);

// US-18: las sesiones de reserva vigentes antes de un reinicio retoman su cuenta regresiva.
temporizadorService
  .restaurarSesiones()
  .then((total) => console.log(`[SERVER] Sesiones de reserva restauradas: ${total}`))
  .catch((error) => console.error('[SERVER] No se pudieron restaurar las sesiones de reserva:', error.message));

httpServer.listen(env.port, () => {
  console.log(`[SERVER] CanchaYa API escuchando en http://localhost:${env.port}`);
});
