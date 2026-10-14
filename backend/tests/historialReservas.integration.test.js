// Prueba de integración (US-13): historial paginado de "Mis reservas" contra Postgres real.
// Requiere DATABASE_URL y JWT_SECRET; si no están configuradas, se omite.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Historial de reservas (US-13, integración)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const request = require('supertest');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');

  describe('Historial de reservas (US-13, integración)', () => {
    let canchaId;
    let usuarioId;
    let otroUsuarioId;
    let token;

    async function insertarReserva(usuario, fecha, horaInicio, horaFin, estado = 'confirmada') {
      await pool.query(
        `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [canchaId, usuario, fecha, horaInicio, horaFin, estado]
      );
    }

    beforeAll(async () => {
      const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const usuarios = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash)
         VALUES ('Test US-13 A', $1, '3000000000', 'hash-no-valido'),
                ('Test US-13 B', $2, '3000000000', 'hash-no-valido')
         RETURNING id`,
        [`us13.a.${sufijo}@test.local`, `us13.b.${sufijo}@test.local`]
      );
      usuarioId = usuarios.rows[0].id;
      otroUsuarioId = usuarios.rows[1].id;
      token = generarToken({ sub: usuarioId });

      const cancha = await pool.query(
        `INSERT INTO canchas (nombre, direccion, disponible, zona, costo_hora)
         VALUES ($1, 'Dirección de prueba', true, 'Zona de prueba', 50000)
         RETURNING id`,
        [`Cancha US-13 ${sufijo}`]
      );
      canchaId = cancha.rows[0].id;

      await insertarReserva(usuarioId, '2000-01-10', '10:00', '11:00'); // pasada, confirmada -> completada
      await insertarReserva(usuarioId, '2000-01-11', '10:00', '11:00', 'cancelada'); // pasada, cancelada
      await insertarReserva(usuarioId, '2099-01-10', '10:00', '11:00'); // próxima, confirmada
      await insertarReserva(usuarioId, '2099-01-11', '10:00', '11:00', 'cancelada'); // próxima, cancelada
      await insertarReserva(usuarioId, '2099-01-12', '10:00', '11:00'); // próxima, confirmada
      await insertarReserva(otroUsuarioId, '2099-01-10', '12:00', '13:00'); // de otro usuario
    });

    afterAll(async () => {
      await pool.query('DELETE FROM reservas WHERE cancha_id = $1', [canchaId]);
      await pool.query('DELETE FROM canchas WHERE id = $1', [canchaId]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[usuarioId, otroUsuarioId]]);
      await pool.end();
    });

    const listar = (consulta = {}) => request(app).get('/api/reservas').query(consulta).set('Authorization', `Bearer ${token}`);

    it('exige autenticación', async () => {
      const respuesta = await request(app).get('/api/reservas');
      expect(respuesta.status).toBe(401);
    });

    it('por defecto lista las próximas del usuario, de la más cercana a la más lejana, sin las de otros', async () => {
      const respuesta = await listar();

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.reservas.map((r) => r.fecha)).toEqual(['2099-01-10', '2099-01-11', '2099-01-12']);
      expect(respuesta.body.reservas[0]).toMatchObject({
        canchaNombre: expect.stringMatching(/^Cancha US-13/),
        horaInicio: '10:00',
        horaFin: '11:00',
        estado: 'confirmada',
        codigo: expect.stringMatching(/^CY-[0-9A-F]{8}$/),
      });
      expect(respuesta.body.paginacion).toEqual({ pagina: 1, limite: 10, total: 3, totalPaginas: 1 });
    });

    it('las pasadas se listan de la más reciente a la más antigua y las confirmadas ya jugadas salen "completada"', async () => {
      const respuesta = await listar({ periodo: 'pasadas' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.reservas.map((r) => [r.fecha, r.estado])).toEqual([
        ['2000-01-11', 'cancelada'],
        ['2000-01-10', 'completada'],
      ]);
    });

    it('filtra por estado y pagina los resultados', async () => {
      const canceladas = await listar({ periodo: 'proximas', estado: 'cancelada' });
      expect(canceladas.body.reservas).toHaveLength(1);
      expect(canceladas.body.reservas[0].fecha).toBe('2099-01-11');

      const completadas = await listar({ periodo: 'pasadas', estado: 'completada' });
      expect(completadas.body.reservas).toHaveLength(1);

      const paginaDos = await listar({ limite: 2, pagina: 2 });
      expect(paginaDos.body.reservas.map((r) => r.fecha)).toEqual(['2099-01-12']);
      expect(paginaDos.body.paginacion).toEqual({ pagina: 2, limite: 2, total: 3, totalPaginas: 2 });
    });

    it('rechaza con 400 parámetros inválidos', async () => {
      expect((await listar({ periodo: 'futuro' })).status).toBe(400);
      expect((await listar({ estado: 'rara' })).status).toBe(400);
      expect((await listar({ limite: 500 })).status).toBe(400);
    });
  });
}
