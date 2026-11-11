const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const env = require('./config/env');
const verificarOrigen = require('./config/corsOrigin');
const { rechazarOrigenNoPermitido } = verificarOrigen;
const { crearRouterDocumentacion, documentacionHabilitada } = require('./config/documentacion');

const app = express();

// No anunciar la tecnología del servidor (cabecera X-Powered-By).
app.disable('x-powered-by');

// Detrás de un proxy con TLS (TRUST_PROXY=true), req.secure refleja si la conexión original fue HTTPS.
if (env.confiarEnProxy) app.set('trust proxy', 1);

app.use(rechazarOrigenNoPermitido);
app.use(cors({ origin: verificarOrigen }));
app.use(express.json());

// Render y Railway exponen el commit desplegado: así el pipeline y el equipo saben qué versión está respondiendo.
const versionDesplegada = (process.env.RENDER_GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.APP_VERSION || '').slice(0, 7);

app.get('/api/health', (req, res) => {
  res.status(200).json({ estado: 'ok', ...(versionDesplegada ? { version: versionDesplegada } : {}) });
});

// Documentación OpenAPI / Swagger UI (RNF-07): desarrollo y staging; en producción solo si se habilita.
if (documentacionHabilitada()) {
  app.use('/api/docs', crearRouterDocumentacion());
}

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ mensaje: 'Recurso no encontrado' });
});

app.use(errorHandler);

module.exports = app;
