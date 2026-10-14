const fs = require('fs');
const path = require('path');
const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const env = require('./env');

const RUTA_ESPECIFICACION = path.join(__dirname, '../../openapi/openapi.yaml');

function cargarEspecificacion() {
  return YAML.parse(fs.readFileSync(RUTA_ESPECIFICACION, 'utf8'));
}

// La documentación se publica en desarrollo y en staging. En producción queda apagada salvo que
// el equipo la active con API_DOCS_HABILITADA=true (y se puede apagar en cualquier ambiente con false).
function documentacionHabilitada() {
  const forzada = process.env.API_DOCS_HABILITADA;
  if (forzada !== undefined && forzada !== '') return forzada === 'true';
  return env.nodeEnv !== 'production';
}

// "Try it out" debe apuntar al servidor desde el que se abrió la página, sea cual sea su puerto.
function especificacionParaPeticion(req) {
  const especificacion = cargarEspecificacion();
  const servidorActual = { url: `${req.protocol}://${req.get('host')}`, description: 'Servidor actual' };
  return { ...especificacion, servers: [servidorActual, ...(especificacion.servers ?? [])] };
}

function crearRouterDocumentacion() {
  const router = Router();
  const opciones = {
    customSiteTitle: 'CanchaYa API · Documentación',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, tryItOutEnabled: true },
  };

  router.get('/openapi.json', (req, res) => res.json(especificacionParaPeticion(req)));
  router.get('/openapi.yaml', (req, res) => res.type('text/yaml').send(fs.readFileSync(RUTA_ESPECIFICACION, 'utf8')));
  router.use('/', swaggerUi.serve);
  router.get('/', (req, res, next) => swaggerUi.setup(especificacionParaPeticion(req), opciones)(req, res, next));

  return router;
}

module.exports = { crearRouterDocumentacion, documentacionHabilitada, cargarEspecificacion, RUTA_ESPECIFICACION };
