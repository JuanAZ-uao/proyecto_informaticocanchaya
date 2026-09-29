const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const verificarOrigen = require('./config/corsOrigin');

const app = express();

app.use(cors({ origin: verificarOrigen }));
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
