// Prueba de contrato (RNF-07): ejecuta contra el backend real los ejemplos de la documentación
// OpenAPI ("Try it out") y comprueba que cada respuesta tenga un código documentado y un cuerpo
// que cumpla el esquema publicado. Requiere DATABASE_URL y JWT_SECRET; si no, se omite.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Contrato OpenAPI (integración)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const request = require('supertest');
  const Ajv = require('ajv');
  const addFormats = require('ajv-formats');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const { cargarEspecificacion } = require('../src/config/documentacion');

  const especificacion = cargarEspecificacion();
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addFormat('password', true);

  // Sustituye cada { $ref } por su definición para obtener un esquema plano que Ajv pueda compilar.
  function resolver(nodo) {
    if (Array.isArray(nodo)) return nodo.map(resolver);
    if (nodo && typeof nodo === 'object') {
      if (nodo.$ref) {
        const destino = nodo.$ref.replace('#/', '').split('/').reduce((actual, clave) => actual[clave], especificacion);
        return resolver(destino);
      }
      return Object.fromEntries(Object.entries(nodo).map(([clave, valor]) => [clave, resolver(valor)]));
    }
    return nodo;
  }

  function validarContrato(ruta, metodo, respuesta) {
    const documentadas = especificacion.paths[ruta][metodo].responses;
    const definicion = documentadas[String(respuesta.status)];
    if (!definicion) {
      throw new Error(`${metodo.toUpperCase()} ${ruta} respondió ${respuesta.status}, que no está documentado (${Object.keys(documentadas).join(', ')})`);
    }

    const esquema = resolver(definicion).content?.['application/json']?.schema;
    if (!esquema) return;

    const valida = ajv.compile(esquema);
    if (!valida(respuesta.body)) {
      throw new Error(`${metodo.toUpperCase()} ${ruta} ${respuesta.status}: el cuerpo no cumple el esquema → ${ajv.errorsText(valida.errors)}`);
    }
  }

  function ejemplo(ruta, metodo) {
    return especificacion.paths[ruta][metodo].requestBody.content['application/json'].example;
  }

  describe('Contrato OpenAPI (integración): los ejemplos de la documentación funcionan contra el backend', () => {
    const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
    const correo = `contrato.${sufijo}@test.local`;
    const otroCorreo = `contrato.otro.${sufijo}@test.local`;
    const password = ejemplo('/api/auth/registro', 'post').password;
    let token;
    let tokenOtro;
    let canchaId;
    let reservaId;
    const fecha = '2099-06-15';

    const con = (peticion, tokenUsuario = token) => (tokenUsuario ? peticion.set('Authorization', `Bearer ${tokenUsuario}`) : peticion);

    async function registrarEIniciar(correoUsuario) {
      const cuerpo = { ...ejemplo('/api/auth/registro', 'post'), correo: correoUsuario };
      const registro = await request(app).post('/api/auth/registro').send(cuerpo);
      validarContrato('/api/auth/registro', 'post', registro);
      expect(registro.status).toBe(201);

      const login = await request(app).post('/api/auth/login').send({ correo: correoUsuario, password });
      validarContrato('/api/auth/login', 'post', login);
      expect(login.status).toBe(200);
      return login.body.token;
    }

    beforeAll(async () => {
      token = await registrarEIniciar(correo);
      tokenOtro = await registrarEIniciar(otroCorreo);

      const cancha = await pool.query(
        `INSERT INTO canchas (nombre, direccion, disponible, zona, costo_hora)
         VALUES ($1, 'Dirección de prueba', true, 'Zona de prueba', 50000) RETURNING id`,
        [`Cancha contrato ${sufijo}`]
      );
      canchaId = cancha.rows[0].id;
      await pool.query(
        `INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin)
         SELECT $1, dia, '06:00', '22:00' FROM generate_series(0, 6) AS dia`,
        [canchaId]
      );
    });

    afterAll(async () => {
      await pool.query('DELETE FROM reservas WHERE cancha_id = $1', [canchaId]);
      await pool.query('DELETE FROM canchas WHERE id = $1', [canchaId]);
      await pool.query('DELETE FROM usuarios WHERE correo = ANY($1)', [[correo, otroCorreo]]);
      await pool.end();
    });

    it('GET /api/health', async () => {
      const respuesta = await request(app).get('/api/health');
      validarContrato('/api/health', 'get', respuesta);
      expect(respuesta.status).toBe(200);
    });

    it('autenticación: errores documentados (409 correo repetido, 401 credenciales, 400 validación)', async () => {
      const repetido = await request(app).post('/api/auth/registro').send({ ...ejemplo('/api/auth/registro', 'post'), correo });
      validarContrato('/api/auth/registro', 'post', repetido);
      expect(repetido.status).toBe(409);

      const invalido = await request(app).post('/api/auth/registro').send({ nombre: 'X' });
      validarContrato('/api/auth/registro', 'post', invalido);
      expect(invalido.status).toBe(400);

      const incorrecto = await request(app).post('/api/auth/login').send({ correo, password: 'Incorrecta123' });
      validarContrato('/api/auth/login', 'post', incorrecto);
      expect(incorrecto.status).toBe(401);
    });

    it('recuperación de contraseña: 200 neutro y 400 con token inválido', async () => {
      const solicitud = await request(app).post('/api/auth/olvide-password').send({ correo });
      validarContrato('/api/auth/olvide-password', 'post', solicitud);
      expect(solicitud.status).toBe(200);

      const restablecer = await request(app).post('/api/auth/restablecer-password').send(ejemplo('/api/auth/restablecer-password', 'post'));
      validarContrato('/api/auth/restablecer-password', 'post', restablecer);
      expect(restablecer.status).toBe(400);
    });

    it('los endpoints protegidos responden 401 documentado sin token', async () => {
      for (const [ruta, url] of [['/api/canchas', '/api/canchas'], ['/api/reservas', '/api/reservas'], ['/api/reservas/mias', '/api/reservas/mias']]) {
        const respuesta = await request(app).get(url);
        validarContrato(ruta, 'get', respuesta);
        expect(respuesta.status).toBe(401);
      }
    });

    it('canchas: listado, detalle, 404 y 400', async () => {
      const lista = await con(request(app).get('/api/canchas'));
      validarContrato('/api/canchas', 'get', lista);
      expect(lista.status).toBe(200);

      const filtro = await con(request(app).get('/api/canchas').query({ precioMin: -1 }));
      validarContrato('/api/canchas', 'get', filtro);
      expect(filtro.status).toBe(400);

      const detalle = await con(request(app).get(`/api/canchas/${canchaId}`));
      validarContrato('/api/canchas/{id}', 'get', detalle);
      expect(detalle.status).toBe(200);
      expect(detalle.body.cancha.horarios).toHaveLength(7);

      const inexistente = await con(request(app).get('/api/canchas/00000000-0000-4000-8000-000000000000'));
      validarContrato('/api/canchas/{id}', 'get', inexistente);
      expect(inexistente.status).toBe(404);

      const malId = await con(request(app).get('/api/canchas/abc'));
      validarContrato('/api/canchas/{id}', 'get', malId);
      expect(malId.status).toBe(400);
    });

    it('disponibilidad y su alias', async () => {
      for (const ruta of ['/api/canchas/{id}/disponibilidad', '/api/canchas/{id}/reservas']) {
        const respuesta = await con(request(app).get(ruta.replace('{id}', canchaId)).query({ fecha }));
        validarContrato(ruta, 'get', respuesta);
        expect(respuesta.status).toBe(200);
      }

      const sinFecha = await con(request(app).get(`/api/canchas/${canchaId}/disponibilidad`));
      validarContrato('/api/canchas/{id}/disponibilidad', 'get', sinFecha);
      expect(sinFecha.status).toBe(400);
    });

    it('reservas: confirmar (201) con el ejemplo, historial, listado completo y errores 409', async () => {
      const cuerpo = { ...ejemplo('/api/canchas/{id}/reservas', 'post'), fecha };
      const creada = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send(cuerpo));
      validarContrato('/api/canchas/{id}/reservas', 'post', creada);
      expect(creada.status).toBe(201);
      reservaId = creada.body.reserva.id;

      const duplicada = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send(cuerpo), tokenOtro);
      validarContrato('/api/canchas/{id}/reservas', 'post', duplicada);
      expect(duplicada.status).toBe(409);
      expect(duplicada.body.mensaje).toBe('El horario ya no está disponible');

      const solapada = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send(cuerpo));
      validarContrato('/api/canchas/{id}/reservas', 'post', solapada);
      expect(solapada.status).toBe(409);

      const fueraDeHorario = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send({ ...cuerpo, horaInicio: '03:00', horaFin: '04:00' }));
      validarContrato('/api/canchas/{id}/reservas', 'post', fueraDeHorario);
      expect(fueraDeHorario.body.codigo).toBe('FUERA_DE_HORARIO');

      const pasada = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send({ ...cuerpo, fecha: '2000-01-01' }));
      validarContrato('/api/canchas/{id}/reservas', 'post', pasada);
      expect(pasada.status).toBe(400);

      const invalida = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send({ fecha }));
      validarContrato('/api/canchas/{id}/reservas', 'post', invalida);
      expect(invalida.status).toBe(400);

      const historial = await con(request(app).get('/api/reservas'));
      validarContrato('/api/reservas', 'get', historial);
      expect(historial.status).toBe(200);
      expect(historial.body.reservas.map((r) => r.id)).toContain(reservaId);

      const filtroInvalido = await con(request(app).get('/api/reservas').query({ periodo: 'futuro' }));
      validarContrato('/api/reservas', 'get', filtroInvalido);
      expect(filtroInvalido.status).toBe(400);

      const mias = await con(request(app).get('/api/reservas/mias'));
      validarContrato('/api/reservas/mias', 'get', mias);
      expect(mias.status).toBe(200);
    });

    it('temporizador: completar sin sesión activa responde el 409 documentado', async () => {
      const respuesta = await con(
        request(app).post(`/api/canchas/${canchaId}/temporizador/completar`).send({ ...ejemplo('/api/canchas/{id}/temporizador/completar', 'post'), fecha, horaInicio: '12:00', horaFin: '13:00' })
      );
      validarContrato('/api/canchas/{id}/temporizador/completar', 'post', respuesta);
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.codigo).toBe('SESION_EXPIRADA');
    });

    it('cancelar: 403 de otro usuario, 200, 409 si ya estaba cancelada, 404 y 400', async () => {
      const ajena = await con(request(app).patch(`/api/reservas/${reservaId}/cancelar`), tokenOtro);
      validarContrato('/api/reservas/{id}/cancelar', 'patch', ajena);
      expect(ajena.status).toBe(403);

      const cancelada = await con(request(app).patch(`/api/reservas/${reservaId}/cancelar`));
      validarContrato('/api/reservas/{id}/cancelar', 'patch', cancelada);
      expect(cancelada.status).toBe(200);
      expect(cancelada.body.reserva.estado).toBe('cancelada');

      const repetida = await con(request(app).patch(`/api/reservas/${reservaId}/cancelar`));
      validarContrato('/api/reservas/{id}/cancelar', 'patch', repetida);
      expect(repetida.status).toBe(409);

      const inexistente = await con(request(app).patch('/api/reservas/00000000-0000-4000-8000-000000000000/cancelar'));
      validarContrato('/api/reservas/{id}/cancelar', 'patch', inexistente);
      expect(inexistente.status).toBe(404);

      const malId = await con(request(app).patch('/api/reservas/abc/cancelar'));
      validarContrato('/api/reservas/{id}/cancelar', 'patch', malId);
      expect(malId.status).toBe(400);
    });
  });
}
