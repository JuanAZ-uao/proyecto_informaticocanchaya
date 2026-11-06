// Prueba de integración real del seed de canchas adicionales contra PostgreSQL: solo agrega, no duplica y no
// toca las canchas ni las reservas que ya existen. Usa un catálogo pequeño y propio (no inserta las 59 canchas
// reales). Requiere DATABASE_URL y JWT_SECRET; si no están, se omite.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Seed de canchas de Cali (integración)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const pool = require('../src/config/db');
  const canchaRepository = require('../src/repositories/canchaRepository');
  const horarioRepository = require('../src/repositories/horarioRepository');
  const { sembrarCanchasCali } = require('../src/seed/planCanchasCali');

  describe('Seed de canchas de Cali (integración)', () => {
    const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
    const catalogo = [1, 2, 3].map((n) => ({
      nombre: `Cancha seed ${n} ${sufijo}`,
      direccion: `Calle ${n} # 1-1, Cali`,
      zona: 'Norte',
      costoHora: 60000 + n * 1000,
      tipo: 'Fútbol 5',
      servicios: ['Iluminación LED', 'Parqueadero'],
      descripcion: 'Cancha de prueba del seed.',
    }));
    const nombres = catalogo.map((c) => c.nombre);
    const repos = { canchaRepository, horarioRepository, catalogo };
    let canchaPreexistenteId;
    let usuarioId;
    let reservaId;

    const contar = async () => {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM canchas WHERE nombre = ANY($1)', [nombres]);
      return rows[0].total;
    };

    beforeAll(async () => {
      // una cancha anterior con una reserva: el seed no debe tocarlas
      const cancha = await pool.query(
        `INSERT INTO canchas (nombre, direccion, zona, costo_hora) VALUES ($1, 'Calle 99, Cali', 'Sur', 50000) RETURNING id`,
        [`Cancha preexistente ${sufijo}`]
      );
      canchaPreexistenteId = cancha.rows[0].id;
      const usuario = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash) VALUES ('Seed', $1, '3000000000', 'x') RETURNING id`,
        [`seed.${sufijo}@test.local`]
      );
      usuarioId = usuario.rows[0].id;
      const reserva = await pool.query(
        `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin) VALUES ($1, $2, '2099-01-01', '10:00', '11:00') RETURNING id`,
        [canchaPreexistenteId, usuarioId]
      );
      reservaId = reserva.rows[0].id;
    });

    afterAll(async () => {
      await pool.query('DELETE FROM canchas WHERE nombre = ANY($1) OR id = $2', [nombres, canchaPreexistenteId]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
      await pool.end();
    });

    it('en la primera ejecución crea las canchas con su horario de 7 días', async () => {
      const resultado = await sembrarCanchasCali(repos);

      expect(resultado).toEqual({ creadas: 3, yaExistian: 0, conHorarioNuevo: 3 });
      expect(await contar()).toBe(3);

      const { rows } = await pool.query(
        `SELECT c.nombre, COUNT(h.id)::int AS dias, MIN(h.hora_inicio)::text AS apertura
         FROM canchas c JOIN horarios_disponibles h ON h.cancha_id = c.id
         WHERE c.nombre = ANY($1) GROUP BY c.nombre ORDER BY c.nombre`,
        [nombres]
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((fila) => fila.dias === 7)).toBe(true);
      // los patrones de horario rotan entre las canchas
      expect(new Set(rows.map((fila) => fila.apertura)).size).toBeGreaterThan(1);
    });

    it('al repetirlo no duplica nada', async () => {
      const resultado = await sembrarCanchasCali(repos);

      expect(resultado).toEqual({ creadas: 0, yaExistian: 3, conHorarioNuevo: 0 });
      expect(await contar()).toBe(3);
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM horarios_disponibles h JOIN canchas c ON c.id = h.cancha_id WHERE c.nombre = ANY($1)`,
        [nombres]
      );
      expect(rows[0].total).toBe(21);
    });

    it('no modifica las canchas ni las reservas que ya existían', async () => {
      await sembrarCanchasCali(repos);

      const { rows: cancha } = await pool.query('SELECT nombre, costo_hora FROM canchas WHERE id = $1', [canchaPreexistenteId]);
      expect(cancha[0].nombre).toBe(`Cancha preexistente ${sufijo}`);
      const { rows: reserva } = await pool.query('SELECT estado FROM reservas WHERE id = $1', [reservaId]);
      expect(reserva[0].estado).toBe('confirmada');
    });

    it('completa el horario de una cancha que lo perdió y no toca las demás', async () => {
      await pool.query('DELETE FROM horarios_disponibles WHERE cancha_id = (SELECT id FROM canchas WHERE nombre = $1)', [nombres[1]]);

      const resultado = await sembrarCanchasCali(repos);

      expect(resultado).toEqual({ creadas: 0, yaExistian: 3, conHorarioNuevo: 1 });
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM horarios_disponibles h JOIN canchas c ON c.id = h.cancha_id WHERE c.nombre = ANY($1)`,
        [nombres]
      );
      expect(rows[0].total).toBe(21);
    });

    it('solo crea las canchas que faltan cuando ya existe una parte del catálogo', async () => {
      await pool.query('DELETE FROM canchas WHERE nombre = $1', [nombres[2]]);

      const resultado = await sembrarCanchasCali(repos);

      expect(resultado).toEqual({ creadas: 1, yaExistian: 2, conHorarioNuevo: 1 });
      expect(await contar()).toBe(3);
    });
  });
}
