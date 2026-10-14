// RNF-07: la especificación OpenAPI existe, es coherente, cubre al menos el 90 % de los
// endpoints implementados y Swagger UI se sirve desde el backend. No necesita base de datos.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sin:uso@localhost:5432/sin_uso';
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn(), on: jest.fn() }));

const request = require('supertest');
const app = require('../src/app');
const { cargarEspecificacion } = require('../src/config/documentacion');
const { MINIMO, calcularCobertura } = require('../scripts/coberturaDocumentacion');

const especificacion = cargarEspecificacion();
const OPERACIONES = ['get', 'post', 'put', 'patch', 'delete'];

function operaciones() {
  return Object.entries(especificacion.paths).flatMap(([ruta, items]) =>
    OPERACIONES.filter((metodo) => items[metodo]).map((metodo) => ({ ruta, metodo, operacion: items[metodo] }))
  );
}

describe('Especificación OpenAPI (RNF-07)', () => {
  it('es OpenAPI 3.x y define la autenticación Bearer JWT', () => {
    expect(especificacion.openapi).toMatch(/^3\./);
    expect(especificacion.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  });

  it('documenta al menos el 90 % de los endpoints implementados y no documenta endpoints que no existen', () => {
    const cobertura = calcularCobertura(app, especificacion);

    expect(cobertura.implementados).toBeGreaterThan(0);
    expect(cobertura.filas.filter((f) => !f.documentado)).toEqual([]);
    expect(cobertura.porcentaje).toBeGreaterThanOrEqual(MINIMO);
    expect(cobertura.sobrantes).toEqual([]);
  });

  it('define los modelos Usuario, Cancha, Reserva y Error una sola vez en components/schemas', () => {
    expect(Object.keys(especificacion.components.schemas)).toEqual(expect.arrayContaining(['Usuario', 'Cancha', 'Reserva', 'Error']));
  });

  it.each(operaciones().map((o) => [`${o.metodo.toUpperCase()} ${o.ruta}`, o]))(
    '%s documenta descripción, operationId, etiqueta y una respuesta exitosa',
    (_nombre, { operacion }) => {
      expect(operacion.summary).toBeTruthy();
      expect(operacion.description).toBeTruthy();
      expect(operacion.operationId).toBeTruthy();
      expect(operacion.tags?.length).toBeGreaterThan(0);
      expect(Object.keys(operacion.responses).some((codigo) => /^2/.test(codigo))).toBe(true);
    }
  );

  it.each(operaciones().filter((o) => o.operacion.security).map((o) => [`${o.metodo.toUpperCase()} ${o.ruta}`, o]))(
    '%s protegido: documenta el 401',
    (_nombre, { operacion }) => {
      expect(operacion.responses['401']).toBeDefined();
    }
  );

  it.each(operaciones().filter((o) => o.operacion.requestBody).map((o) => [`${o.metodo.toUpperCase()} ${o.ruta}`, o]))(
    '%s con cuerpo: tiene esquema y ejemplo, y documenta el 400',
    (_nombre, { operacion }) => {
      const contenido = operacion.requestBody.content['application/json'];
      expect(contenido.schema).toBeDefined();
      expect(contenido.example ?? contenido.examples).toBeDefined();
      expect(operacion.responses['400']).toBeDefined();
    }
  );

  it('documenta los errores del motor de reservas: 409 de duplicada, solapada, límite y retenida', () => {
    const ejemplos = especificacion.paths['/api/canchas/{id}/reservas'].post.responses['409'].content['application/json'].examples;
    expect(Object.keys(ejemplos)).toEqual(expect.arrayContaining(['duplicada', 'retenida', 'solapada', 'limite']));
  });

  it('documenta los eventos de Socket.IO de US-17 y US-18', () => {
    const tag = especificacion.tags.find((t) => t.name === 'Socket.IO (tiempo real)');
    const eventos = [
      'retencion:solicitar', 'retencion:liberar', 'temporizador:reiniciar', 'temporizador:inicio', 'temporizador:sync',
      'temporizador:expirado', 'temporizador:error', 'retencion:confirmada', 'disponibilidad:retenida',
      'disponibilidad:liberada', 'disponibilidad:reservada',
    ];
    eventos.forEach((evento) => expect(tag.description).toContain(`\`${evento}\``));
  });
});

describe('Swagger UI en /api/docs', () => {
  it('sirve la interfaz HTML', async () => {
    const respuesta = await request(app).get('/api/docs/').redirects(1);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/html/);
    expect(respuesta.text).toContain('swagger-ui');
  });

  it('sirve la especificación en JSON apuntando al servidor desde el que se consulta', async () => {
    const respuesta = await request(app).get('/api/docs/openapi.json').set('Host', 'localhost:4321');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.openapi).toMatch(/^3\./);
    expect(respuesta.body.servers[0].url).toBe('http://localhost:4321');
  });

  it('sirve la especificación en YAML', async () => {
    const respuesta = await request(app).get('/api/docs/openapi.yaml');
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('openapi: 3.0.3');
  });
});
