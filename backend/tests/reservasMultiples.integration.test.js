// Prueba de integración real (US-12): reservas múltiples del mismo usuario contra la
// base de datos de Neon (Postgres).
//
// Cubre, contra la base de datos real (no mocks):
//   - Un usuario puede tener varias reservas activas a la vez, en canchas/fechas/horas
//     distintas, y las 3 quedan activas y visibles (prueba de aceptación del AC).
//   - El mismo usuario NO puede tener dos reservas que se solapen en la misma fecha/hora,
//     aunque sean en canchas distintas (409 "Ya tienes una reserva en ese horario").
//   - Cancelar una reserva no afecta a las demás reservas activas del usuario.
//   - Límite máximo configurable de reservas activas por usuario (MAX_RESERVAS_ACTIVAS_USUARIO).
//
// Requiere DATABASE_URL y JWT_SECRET (las mismas variables que usa la app). Si no están
// configuradas, la prueba se omite en lugar de fallar.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Reservas múltiples por usuario (US-12, contra Neon real)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const request = require('supertest');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const { generarToken } = require('../src/utils/jwt');
  const { maxReservasActivasPorUsuario } = require('../src/config/env');

  describe('Reservas múltiples por usuario (US-12, contra Neon real)', () => {
    const fecha = '2099-11-15';
    let canchaUnoId;
    let canchaDosId;
    const usuariosCreados = [];
    const canchasCreadas = [];

    async function crearUsuarioConToken(etiqueta) {
      const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash)
         VALUES ($1, $2, '3000000000', 'hash-no-valido')
         RETURNING id`,
        [`Test US-12 ${etiqueta}`, `us12.${etiqueta}.${sufijo}@test.local`]
      );
      const usuarioId = rows[0].id;
      usuariosCreados.push(usuarioId);
      return { usuarioId, token: generarToken({ sub: usuarioId }) };
    }

    beforeAll(async () => {
      const sufijo = Date.now();
      const canchas = await pool.query(
        `INSERT INTO canchas (nombre, direccion, disponible, zona, costo_hora)
         VALUES
           ($1, 'Dirección de prueba 1', true, 'Zona de prueba', 50000),
           ($2, 'Dirección de prueba 2', true, 'Zona de prueba', 50000)
         RETURNING id`,
        [`Cancha US-12 A ${sufijo}`, `Cancha US-12 B ${sufijo}`]
      );
      canchaUnoId = canchas.rows[0].id;
      canchaDosId = canchas.rows[1].id;
      canchasCreadas.push(canchaUnoId, canchaDosId);

      // Horario de atención diario (la API valida que la reserva caiga dentro del horario de la cancha).
      await pool.query(
        `INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin)
         SELECT c, dia, '06:00', '22:00' FROM unnest($1::uuid[]) AS c, generate_series(0, 6) AS dia`,
        [canchasCreadas]
      );
    });

    afterAll(async () => {
      await pool.query('DELETE FROM reservas WHERE cancha_id = ANY($1)', [canchasCreadas]);
      await pool.query('DELETE FROM canchas WHERE id = ANY($1)', [canchasCreadas]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [usuariosCreados]);
      await pool.end();
    });

    it('un usuario crea 3 reservas en canchas/horarios distintos y las 3 quedan activas y visibles (prueba de aceptación)', async () => {
      const { usuarioId, token } = await crearUsuarioConToken('tres-reservas');

      const franjas = [
        { canchaId: canchaUnoId, horaInicio: '06:00', horaFin: '07:00' },
        { canchaId: canchaDosId, horaInicio: '07:00', horaFin: '08:00' },
        { canchaId: canchaUnoId, horaInicio: '08:00', horaFin: '09:00' },
      ];

      for (const franja of franjas) {
        const respuesta = await request(app)
          .post(`/api/canchas/${franja.canchaId}/reservas`)
          .set('Authorization', `Bearer ${token}`)
          .send({ fecha, horaInicio: franja.horaInicio, horaFin: franja.horaFin });

        expect(respuesta.status).toBe(201);
        expect(respuesta.body.reserva.estado).toBe('confirmada');
      }

      const historial = await request(app).get('/api/reservas/mias').set('Authorization', `Bearer ${token}`);
      expect(historial.status).toBe(200);

      const propias = historial.body.reservas.filter((r) => r.fecha === fecha);
      expect(propias).toHaveLength(3);
      expect(propias.every((r) => r.estado === 'confirmada')).toBe(true);

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reservas WHERE usuario_id = $1 AND estado = 'confirmada'`,
        [usuarioId]
      );
      expect(rows[0].total).toBe(3);
    });

    it('rechaza con 409 "Ya tienes una reserva en ese horario" si el usuario ya tiene otra reserva confirmada que se solapa, aunque sea en otra cancha', async () => {
      const { usuarioId, token } = await crearUsuarioConToken('solape');

      const primera = await request(app)
        .post(`/api/canchas/${canchaUnoId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha, horaInicio: '09:00', horaFin: '10:00' });
      expect(primera.status).toBe(201);

      const segunda = await request(app)
        .post(`/api/canchas/${canchaDosId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha, horaInicio: '09:00', horaFin: '10:00' });

      expect(segunda.status).toBe(409);
      expect(segunda.body.mensaje).toBe('Ya tienes una reserva en ese horario');

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reservas
         WHERE usuario_id = $1 AND fecha = $2 AND estado = 'confirmada'`,
        [usuarioId, fecha]
      );
      expect(rows[0].total).toBe(1);
    });

    it('reservar la misma franja de la misma cancha sigue bloqueado para cualquier usuario, incluido uno distinto (regresión US-09)', async () => {
      const { token: tokenUno } = await crearUsuarioConToken('us09-regresion-uno');
      const { token: tokenDos } = await crearUsuarioConToken('us09-regresion-dos');
      const franja = { fecha, horaInicio: '10:00', horaFin: '11:00' };

      const primera = await request(app)
        .post(`/api/canchas/${canchaUnoId}/reservas`)
        .set('Authorization', `Bearer ${tokenUno}`)
        .send(franja);
      expect(primera.status).toBe(201);

      const segunda = await request(app)
        .post(`/api/canchas/${canchaUnoId}/reservas`)
        .set('Authorization', `Bearer ${tokenDos}`)
        .send(franja);
      expect(segunda.status).toBe(409);
    });

    it('cancelar una reserva no afecta a las demás reservas activas del usuario', async () => {
      const { token } = await crearUsuarioConToken('cancelar-independiente');

      const reservaUno = await request(app)
        .post(`/api/canchas/${canchaUnoId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha, horaInicio: '12:00', horaFin: '13:00' });
      const reservaDos = await request(app)
        .post(`/api/canchas/${canchaDosId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha, horaInicio: '13:00', horaFin: '14:00' });

      expect(reservaUno.status).toBe(201);
      expect(reservaDos.status).toBe(201);

      const cancelacion = await request(app)
        .patch(`/api/reservas/${reservaUno.body.reserva.id}/cancelar`)
        .set('Authorization', `Bearer ${token}`);
      expect(cancelacion.status).toBe(200);

      const historial = await request(app).get('/api/reservas/mias').set('Authorization', `Bearer ${token}`);
      const laCancelada = historial.body.reservas.find((r) => r.id === reservaUno.body.reserva.id);
      const laOtra = historial.body.reservas.find((r) => r.id === reservaDos.body.reserva.id);

      expect(laCancelada.estado).toBe('cancelada');
      expect(laOtra.estado).toBe('confirmada');
    });

    it(`rechaza con 409 y un mensaje claro al superar el máximo de reservas activas (configurado: ${maxReservasActivasPorUsuario})`, async () => {
      const { token } = await crearUsuarioConToken('limite');

      for (let i = 0; i < maxReservasActivasPorUsuario; i += 1) {
        const horaInicio = `${String(6 + i).padStart(2, '0')}:00`;
        const horaFin = `${String(7 + i).padStart(2, '0')}:00`;
        const respuesta = await request(app)
          .post(`/api/canchas/${canchaUnoId}/reservas`)
          .set('Authorization', `Bearer ${token}`)
          .send({ fecha: '2099-11-16', horaInicio, horaFin });

        expect(respuesta.status).toBe(201);
      }

      const horaExtra = `${String(6 + maxReservasActivasPorUsuario).padStart(2, '0')}:00`;
      const horaExtraFin = `${String(7 + maxReservasActivasPorUsuario).padStart(2, '0')}:00`;
      const respuestaExtra = await request(app)
        .post(`/api/canchas/${canchaDosId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha: '2099-11-16', horaInicio: horaExtra, horaFin: horaExtraFin });

      expect(respuestaExtra.status).toBe(409);
      expect(respuestaExtra.body.mensaje).toMatch(/reservas activas/i);
    }, 30000);

    it('las reservas ya jugadas ("completada") no cuentan para el límite de reservas activas', async () => {
      const { usuarioId, token } = await crearUsuarioConToken('limite-pasadas');

      for (let i = 0; i < maxReservasActivasPorUsuario; i += 1) {
        await pool.query(
          `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado)
           VALUES ($1, $2, '2000-01-10', $3, $4, 'confirmada')`,
          [canchaUnoId, usuarioId, `${String(6 + i).padStart(2, '0')}:00`, `${String(7 + i).padStart(2, '0')}:00`]
        );
      }

      const respuesta = await request(app)
        .post(`/api/canchas/${canchaDosId}/reservas`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fecha: '2099-11-17', horaInicio: '06:00', horaFin: '07:00' });

      expect(respuesta.status).toBe(201);
    }, 30000);
  });
}
