// Prueba de integración real (US-15) contra PostgreSQL: crear, editar, desactivar y reactivar canchas, con el
// catálogo público y las reservas existentes. Requiere DATABASE_URL y JWT_SECRET; si no están, se omite.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Gestión de canchas (integración)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const request = require('supertest');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');

  const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  const FECHA = '2099-06-15'; // lunes

  describe('Gestión de canchas (integración)', () => {
    const usuarios = {};
    const canchasCreadas = [];

    async function crearUsuario(etiqueta, rol = 'usuario') {
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol) VALUES ($1, $2, '3001234567', 'x', $3) RETURNING id`,
        [`Usuario ${etiqueta}`, `${etiqueta}.${sufijo}@test.local`, rol]
      );
      usuarios[etiqueta] = { id: rows[0].id, token: generarToken({ sub: rows[0].id }) };
    }

    const con = (peticion, usuario) => peticion.set('Authorization', `Bearer ${usuario.token}`);
    const cuerpo = (extra = {}) => ({
      nombre: `Cancha prueba ${sufijo}`,
      direccion: 'Calle 1 # 2-3, Cali',
      zona: `Zona ${sufijo}`,
      costoHora: 75000,
      tipo: 'Fútbol 6',
      descripcion: 'Cancha de prueba',
      servicios: ['Parqueadero'],
      horarios: [
        { diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' },
        { diaSemana: 6, horaInicio: '07:00', horaFin: '20:00' },
      ],
      ...extra,
    });

    async function crearCancha(extra) {
      const respuesta = await con(request(app).post('/api/admin/canchas').send(cuerpo(extra)), usuarios.admin);
      if (respuesta.status === 201) canchasCreadas.push(respuesta.body.cancha.id);
      return respuesta;
    }

    const catalogoPublico = async () => (await con(request(app).get('/api/canchas'), usuarios.ana)).body.canchas;

    beforeAll(async () => {
      await crearUsuario('admin', 'administrador');
      await crearUsuario('ana');
    });

    afterAll(async () => {
      await pool.query('DELETE FROM reservas WHERE cancha_id = ANY($1)', [canchasCreadas]);
      await pool.query('DELETE FROM canchas WHERE id = ANY($1)', [canchasCreadas]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [Object.values(usuarios).map((u) => u.id)]);
      await pool.end();
    });

    it('crea la cancha con su horario, aparece en el catálogo público y guarda lo enviado', async () => {
      const respuesta = await crearCancha();

      expect(respuesta.status).toBe(201);
      const { cancha } = respuesta.body;
      expect(cancha).toMatchObject({ nombre: `Cancha prueba ${sufijo}`, costoHora: 75000, tipo: 'Fútbol 6', disponible: true, reservasFuturas: 0 });
      expect(cancha.horarios).toEqual([
        { diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' },
        { diaSemana: 6, horaInicio: '07:00', horaFin: '20:00' },
      ]);

      expect((await catalogoPublico()).map((c) => c.id)).toContain(cancha.id);
      const detalle = await con(request(app).get(`/api/canchas/${cancha.id}`), usuarios.ana);
      expect(detalle.status).toBe(200);
      expect(detalle.body.cancha.horarios).toHaveLength(2);
    });

    it('rechaza datos inválidos sin guardar nada: precio, horas y campos obligatorios', async () => {
      const antes = (await pool.query('SELECT COUNT(*)::int AS total FROM canchas')).rows[0].total;

      for (const extra of [{ costoHora: 0 }, { nombre: ' ' }, { direccion: '' }, { horarios: [{ diaSemana: 1, horaInicio: '22:00', horaFin: '06:00' }] }, { horarios: [] }]) {
        const respuesta = await con(request(app).post('/api/admin/canchas').send(cuerpo(extra)), usuarios.admin);
        expect(respuesta.status).toBe(400);
        expect(respuesta.body.errores.length).toBeGreaterThan(0);
      }

      expect((await pool.query('SELECT COUNT(*)::int AS total FROM canchas')).rows[0].total).toBe(antes);
    });

    it('un usuario sin rol de administrador recibe 403 y no se crea nada', async () => {
      const respuesta = await con(request(app).post('/api/admin/canchas').send(cuerpo({ nombre: `No debe existir ${sufijo}` })), usuarios.ana);

      expect(respuesta.status).toBe(403);
      const { rows } = await pool.query('SELECT 1 FROM canchas WHERE nombre = $1', [`No debe existir ${sufijo}`]);
      expect(rows).toHaveLength(0);
    });

    it('editar refleja los cambios en el catálogo y NO altera las reservas ya confirmadas', async () => {
      const { body } = await crearCancha({ nombre: `Cancha editable ${sufijo}` });
      const id = body.cancha.id;
      const reserva = await con(request(app).post(`/api/canchas/${id}/reservas`).send({ fecha: FECHA, horaInicio: '10:00', horaFin: '11:00' }), usuarios.ana);
      expect(reserva.status).toBe(201);

      const editada = await con(
        request(app)
          .put(`/api/admin/canchas/${id}`)
          .send(cuerpo({ nombre: `Cancha renombrada ${sufijo}`, costoHora: 99000, horarios: [{ diaSemana: 1, horaInicio: '12:00', horaFin: '18:00' }] })),
        usuarios.admin
      );

      expect(editada.status).toBe(200);
      expect(editada.body.cancha).toMatchObject({ nombre: `Cancha renombrada ${sufijo}`, costoHora: 99000, reservasFuturas: 1 });
      expect(editada.body.cancha.horarios).toEqual([{ diaSemana: 1, horaInicio: '12:00', horaFin: '18:00' }]);
      expect((await catalogoPublico()).find((c) => c.id === id)).toMatchObject({ nombre: `Cancha renombrada ${sufijo}`, costoHora: 99000 });

      // la reserva (10:00, fuera del nuevo horario) sigue intacta
      const { rows } = await pool.query('SELECT estado, to_char(hora_inicio, \'HH24:MI\') AS inicio FROM reservas WHERE id = $1', [reserva.body.reserva.id]);
      expect(rows[0]).toEqual({ estado: 'confirmada', inicio: '10:00' });
    });

    it('editar una cancha que no existe responde 404 y no crea nada', async () => {
      const respuesta = await con(request(app).put('/api/admin/canchas/00000000-0000-4000-8000-000000000000').send(cuerpo()), usuarios.admin);

      expect(respuesta.status).toBe(404);
    });

    it('desactivar con reservas futuras advierte, exige confirmación y conserva el historial', async () => {
      const { body } = await crearCancha({ nombre: `Cancha con reservas ${sufijo}` });
      const id = body.cancha.id;
      const reserva = await con(request(app).post(`/api/canchas/${id}/reservas`).send({ fecha: FECHA, horaInicio: '09:00', horaFin: '10:00' }), usuarios.ana);
      expect(reserva.status).toBe(201);

      const advertencia = await con(request(app).patch(`/api/admin/canchas/${id}/desactivar`).send({}), usuarios.admin);
      expect(advertencia.status).toBe(409);
      expect(advertencia.body).toMatchObject({ codigo: 'CONFIRMACION_REQUERIDA', reservasAfectadas: 1 });
      expect(advertencia.body.reservas[0]).toMatchObject({ codigo: reserva.body.reserva.codigo, usuarioNombre: 'Usuario ana', fecha: FECHA, horaInicio: '09:00' });
      expect((await pool.query('SELECT disponible FROM canchas WHERE id = $1', [id])).rows[0].disponible).toBe(true);

      const desactivada = await con(request(app).patch(`/api/admin/canchas/${id}/desactivar`).send({ confirmar: true }), usuarios.admin);
      expect(desactivada.status).toBe(200);
      expect(desactivada.body).toMatchObject({ reservasAfectadas: 1, cancha: { disponible: false } });

      // deja de mostrarse al público, su detalle responde 404 y no admite nuevas reservas
      expect((await catalogoPublico()).map((c) => c.id)).not.toContain(id);
      expect((await con(request(app).get(`/api/canchas/${id}`), usuarios.ana)).status).toBe(404);
      const nueva = await con(request(app).post(`/api/canchas/${id}/reservas`).send({ fecha: FECHA, horaInicio: '15:00', horaFin: '16:00' }), usuarios.ana);
      expect(nueva.status).toBe(409);
      expect(nueva.body.codigo).toBe('CANCHA_NO_DISPONIBLE');

      // el historial se conserva: la reserva sigue confirmada y visible para el usuario
      const historial = await con(request(app).get('/api/reservas').query({ limite: 50 }), usuarios.ana);
      expect(historial.body.reservas.find((r) => r.id === reserva.body.reserva.id)).toMatchObject({ estado: 'confirmada', canchaNombre: `Cancha con reservas ${sufijo}` });

      // el administrador sigue viéndola (desactivada) y puede reactivarla
      const lista = await con(request(app).get('/api/admin/canchas'), usuarios.admin);
      expect(lista.body.canchas.find((c) => c.id === id)).toMatchObject({ disponible: false, reservasFuturas: 1 });
      expect((await con(request(app).patch(`/api/admin/canchas/${id}/desactivar`).send({ confirmar: true }), usuarios.admin)).status).toBe(409);
      const reactivada = await con(request(app).patch(`/api/admin/canchas/${id}/activar`), usuarios.admin);
      expect(reactivada.status).toBe(200);
      expect((await catalogoPublico()).map((c) => c.id)).toContain(id);
    });

    it('desactivar una cancha sin reservas futuras no pide confirmación', async () => {
      const { body } = await crearCancha({ nombre: `Cancha sin reservas ${sufijo}` });

      const respuesta = await con(request(app).patch(`/api/admin/canchas/${body.cancha.id}/desactivar`).send({}), usuarios.admin);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.reservasAfectadas).toBe(0);
    });

    it('una reserva ya terminada no cuenta como futura al desactivar', async () => {
      const { body } = await crearCancha({ nombre: `Cancha con pasado ${sufijo}` });
      await pool.query(
        `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin) VALUES ($1, $2, '2000-01-03', '10:00', '11:00')`,
        [body.cancha.id, usuarios.ana.id]
      );

      const respuesta = await con(request(app).patch(`/api/admin/canchas/${body.cancha.id}/desactivar`).send({}), usuarios.admin);

      expect(respuesta.status).toBe(200);
    });
  });
}
