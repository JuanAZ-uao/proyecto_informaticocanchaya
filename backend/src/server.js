const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const verificarOrigen = require('./config/corsOrigin');
const registrarTemporizadorSocket = require('./sockets/temporizadorSocket');
const temporizadorService = require('./services/temporizadorReservaService');
const pool = require('./config/db');

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: verificarOrigen },
});

registrarTemporizadorSocket(io);

// US-18: las sesiones de reserva vigentes antes de un reinicio retoman su cuenta regresiva.
pool.listo
  .then(() => temporizadorService.restaurarSesiones())
  .then((total) => console.log(`[SERVER] Sesiones de reserva restauradas: ${total}`))
  .catch((error) => console.error('[SERVER] No se pudieron restaurar las sesiones de reserva:', error.message));

httpServer.listen(env.port, () => {
  console.log(`[SERVER] CanchaYa API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
});

// US-25: línea periódica con las conexiones de socket activas y la memoria, para consultarla en los logs de Railway.
// No incluye datos de usuarios.
const INTERVALO_METRICAS_MS = Number(process.env.METRICAS_INTERVALO_MS || 60000);
setInterval(() => {
  const memoriaMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log(`[METRICAS] sockets_activos=${io.engine.clientsCount} memoria_mb=${memoriaMb}`);
}, INTERVALO_METRICAS_MS).unref();

// Railway envía SIGTERM al reemplazar un despliegue: se cierran las conexiones con orden en lugar de cortarlas.
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM recibido: cerrando conexiones');
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
});
