const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

const LOCALHOST_ORIGIN_REGEX = /^http:\/\/localhost:\d+$/;

app.use(
  cors({
    origin(origin, callback) {
      // Sin origin (ej. Postman/curl) o cualquier puerto de localhost en desarrollo.
      if (!origin || env.nodeEnv !== 'production' && LOCALHOST_ORIGIN_REGEX.test(origin)) {
        return callback(null, true);
      }

      if (origin === env.corsOrigin) {
        return callback(null, true);
      }

      return callback(new Error('No permitido por CORS'));
    },
  })
);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({ estado: 'ok' });
});

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ mensaje: 'Recurso no encontrado' });
});

app.use(errorHandler);

module.exports = app;
