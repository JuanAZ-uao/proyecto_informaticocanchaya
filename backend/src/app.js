const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const verificarOrigen = require('./config/corsOrigin');
const { rechazarOrigenNoPermitido } = verificarOrigen;
const { crearRouterDocumentacion, documentacionHabilitada } = require('./config/documentacion');

const app = express();

// No anunciar la tecnología del servidor (cabecera X-Powered-By).
app.disable('x-powered-by');

app.use(rechazarOrigenNoPermitido);
app.use(cors({ origin: verificarOrigen }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({ estado: 'ok' });
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
