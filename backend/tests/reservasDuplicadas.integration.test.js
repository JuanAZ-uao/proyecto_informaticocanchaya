// Prueba de integración real: dispara dos peticiones HTTP simultáneas contra la
// base de datos de Neon (Postgres) para comprobar que el índice único parcial
// (cancha_id, fecha, hora_inicio) WHERE estado = 'activa' impide duplicados
// incluso cuando dos usuarios reservan la misma franja al mismo tiempo.
//
// Requiere DATABASE_URL y JWT_SECRET (las mismas variables que usa la app),
// normalmente apuntando a la base de datos de desarrollo en Neon. Si no están
// configuradas, la prueba se omite en lugar de fallar.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Bloqueo de reservas duplicadas (concurrencia real en Neon)', () => {
    it.skip('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse', () => {});
  });
} else {
  const request = require('supertest');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');

  describe('Bloqueo de reservas duplicadas (concurrencia real en Neon)', () => {
    let usuarioUnoId;
    let usuarioDosId;
    let canchaId;
    let token1;
    let token2;
    const fecha = '2099-12-31';
    const horaInicio = '10:00';
    const horaFin = '11:00';

    beforeAll(async () => {
      const sufijo = Date.now();

      const usuarios = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash)
         VALUES
           ('Test Reserva 1', $1, '3000000000', 'hash-no-valido'),
           ('Test Reserva 2', $2, '3000000001', 'hash-no-valido')
         RETURNING id`,
        [`us09.uno.${sufijo}@test.local`, `us09.dos.${sufijo}@test.local`]
      );
      usuarioUnoId = usuarios.rows[0].id;
      usuarioDosId = usuarios.rows[1].id;

      const canchas = await pool.query(
        `INSERT INTO canchas (nombre, direccion, disponible, zona, costo_hora)
         VALUES ($1, 'Dirección de prueba', true, 'Zona de prueba', 50000)
         RETURNING id`,
        [`Cancha US-09 ${sufijo}`]
      );
      canchaId = canchas.rows[0].id;

      token1 = generarToken({ sub: usuarioUnoId });
      token2 = generarToken({ sub: usuarioDosId });
    });

    afterAll(async () => {
      await pool.query('DELETE FROM reservas WHERE cancha_id = $1', [canchaId]);
      await pool.query('DELETE FROM canchas WHERE id = $1', [canchaId]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[usuarioUnoId, usuarioDosId]]);
      await pool.end();
    });

    it('ante dos peticiones simultáneas por la misma franja, solo una crea la reserva (201) y la otra recibe 409', async () => {
      const cuerpo = { fecha, horaInicio, horaFin };

      const [respuesta1, respuesta2] = await Promise.all([
        request(app).post(`/api/canchas/${canchaId}/reservas`).set('Authorization', `Bearer ${token1}`).send(cuerpo),
        request(app).post(`/api/canchas/${canchaId}/reservas`).set('Authorization', `Bearer ${token2}`).send(cuerpo),
      ]);

      const estados = [respuesta1.status, respuesta2.status].sort();
      expect(estados).toEqual([201, 409]);

      const ganadora = respuesta1.status === 201 ? respuesta1 : respuesta2;
      const rechazada = respuesta1.status === 201 ? respuesta2 : respuesta1;

      expect(ganadora.body.reserva).toBeDefined();
      expect(rechazada.body.mensaje).toMatch(/no está disponible/i);

      const { rows } = await pool.query(
        `SELECT * FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3 AND estado = 'activa'`,
        [canchaId, fecha, horaInicio]
      );
      expect(rows).toHaveLength(1);
    });

    it('al cancelar la reserva ganadora, la franja queda libre y se puede volver a reservar', async () => {
      const { rows } = await pool.query(
        `SELECT id FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3 AND estado = 'activa'`,
        [canchaId, fecha, horaInicio]
      );
      const reservaId = rows[0].id;
      const propietarioId = (await pool.query('SELECT usuario_id FROM reservas WHERE id = $1', [reservaId])).rows[0]
        .usuario_id;
      const tokenPropietario = propietarioId === usuarioUnoId ? token1 : token2;

      const respuestaCancelacion = await request(app)
        .patch(`/api/reservas/${reservaId}/cancelar`)
        .set('Authorization', `Bearer ${tokenPropietario}`);

      expect(respuestaCancelacion.status).toBe(200);
      expect(respuestaCancelacion.body.reserva.estado).toBe('cancelada');

      const respuestaNuevaReserva = await request(app)
        .post(`/api/canchas/${canchaId}/reservas`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ fecha, horaInicio, horaFin });

      expect(respuestaNuevaReserva.status).toBe(201);
    });

    it('no deja registros huérfanos: un intento duplicado no inserta filas parciales', async () => {
      const cuerpo = { fecha: '2099-12-30', horaInicio: '09:00', horaFin: '10:00' };

      await request(app).post(`/api/canchas/${canchaId}/reservas`).set('Authorization', `Bearer ${token1}`).send(cuerpo);
      const respuestaDuplicada = await request(app)
        .post(`/api/canchas/${canchaId}/reservas`)
        .set('Authorization', `Bearer ${token2}`)
        .send(cuerpo);

      expect(respuestaDuplicada.status).toBe(409);

      const { rows } = await pool.query(
        `SELECT * FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3`,
        [canchaId, cuerpo.fecha, cuerpo.horaInicio]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].estado).toBe('activa');
    });
  });
}
