const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const verificarOrigen = require('./config/corsOrigin');
const registrarTemporizadorSocket = require('./sockets/temporizadorSocket');
require('./config/db');

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: verificarOrigen },
});

registrarTemporizadorSocket(io);

httpServer.listen(env.port, () => {
  console.log(`[SERVER] CanchaYa API escuchando en http://localhost:${env.port}`);
});
