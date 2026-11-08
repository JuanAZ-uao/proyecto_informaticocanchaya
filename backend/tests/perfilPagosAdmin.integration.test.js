// Prueba de integración real (US-14, US-27, US-28 y US-29) contra PostgreSQL: cancelación con reembolso,
// perfil y cambio de correo con verificación, tarjetas tokenizadas, pago al reservar y verificación del
// código por el administrador. Requiere DATABASE_URL y JWT_SECRET; si no están, se omite.

require('dotenv').config();

const tieneEntorno = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!tieneEntorno) {
  describe('Perfil, pagos, cancelación y administración (integración)', () => {
    it.todo('requiere DATABASE_URL y JWT_SECRET configuradas para ejecutarse');
  });
} else {
  const request = require('supertest');
  const pool = require('../src/config/db');
  const app = require('../src/app');
  const env = require('../src/config/env');
  const { generarToken } = require('../src/utils/jwt');

  const sufijo = `${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  const ANIO = new Date().getFullYear() + 3;
  const FECHA_LEJANA = '2099-08-10';

  describe('Perfil, pagos, cancelación y administración (integración)', () => {
    const usuarios = {};
    let canchaId;
    const reservasCreadas = [];

    async function crearUsuario(etiqueta, rol = 'usuario') {
      const { rows } = await pool.query(
        `INSERT INTO usuarios (nombre, correo, telefono, password_hash, rol)
         VALUES ($1, $2, '3001234567', $3, $4) RETURNING id, correo`,
        [`Usuario ${etiqueta}`, `${etiqueta}.${sufijo}@test.local`, require('bcryptjs').hashSync('Password123!', 4), rol]
      );
      usuarios[etiqueta] = { id: rows[0].id, correo: rows[0].correo, token: generarToken({ sub: rows[0].id }) };
      return usuarios[etiqueta];
    }

    const con = (peticion, usuario) => peticion.set('Authorization', `Bearer ${usuario.token}`);
    const tarjeta = (extra = {}) => ({ numero: '4242 4242 4242 4242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: ANIO, cvv: '123', ...extra });

    async function guardarTarjeta(usuario, extra = {}) {
      const respuesta = await con(request(app).post(`/api/usuarios/${usuario.id}/metodos-pago`).send(tarjeta(extra)), usuario);
      expect(respuesta.status).toBe(201);
      return respuesta.body.metodoPago;
    }

    async function reservar(usuario, horaInicio, horaFin, metodoPagoId, fecha = FECHA_LEJANA) {
      const cuerpo = { fecha, horaInicio, horaFin, ...(metodoPagoId ? { metodoPagoId } : {}) };
      const respuesta = await con(request(app).post(`/api/canchas/${canchaId}/reservas`).send(cuerpo), usuario);
      if (respuesta.status === 201) reservasCreadas.push(respuesta.body.reserva.id);
      return respuesta;
    }

    // Fecha y hora de Colombia dentro de `minutos` minutos, para crear reservas que empiezan pronto.
    function colombiaEn(minutos) {
      const momento = new Date(Date.now() + minutos * 60000 - 5 * 3600 * 1000).toISOString();
      return { fecha: momento.slice(0, 10), hora: momento.slice(11, 16) };
    }

    // Reserva corta (15 min) que empieza dentro de `minutos` minutos: no choca con otras por la restricción de solape.
    function rangoDesdeAhora(minutos) {
      const inicio = colombiaEn(minutos);
      const fin = colombiaEn(minutos + 15);
      return { fecha: inicio.fecha, inicio: inicio.hora, fin: fin.fecha === inicio.fecha ? fin.hora : '23:59' };
    }

    async function insertarReserva(usuario, fecha, horaInicio, horaFin, estado = 'confirmada') {
      const { rows } = await pool.query(
        `INSERT INTO reservas (cancha_id, usuario_id, fecha, hora_inicio, hora_fin, estado)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, codigo`,
        [canchaId, usuario.id, fecha, horaInicio, horaFin, estado]
      );
      reservasCreadas.push(rows[0].id);
      return rows[0];
    }

    const limiteOriginal = env.maxReservasActivasPorUsuario;

    beforeAll(async () => {
      // Estas pruebas crean muchas reservas por usuario: el tope de reservas activas (US-12) tiene sus propias pruebas.
      env.maxReservasActivasPorUsuario = 100;
      await crearUsuario('ana');
      await crearUsuario('luis');
      await crearUsuario('admin', 'administrador');

      const cancha = await pool.query(
        `INSERT INTO canchas (nombre, direccion, disponible, zona, costo_hora)
         VALUES ($1, 'Dirección de prueba', true, 'Zona de prueba', 60000) RETURNING id`,
        [`Cancha integración ${sufijo}`]
      );
      canchaId = cancha.rows[0].id;
      await pool.query(
        `INSERT INTO horarios_disponibles (cancha_id, dia_semana, hora_inicio, hora_fin)
         SELECT $1, dia, '06:00', '22:00' FROM generate_series(0, 6) AS dia`,
        [canchaId]
      );
    });

    afterAll(async () => {
      env.maxReservasActivasPorUsuario = limiteOriginal;
      const ids = Object.values(usuarios).map((u) => u.id);
      await pool.query('DELETE FROM verificaciones_reserva WHERE administrador_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM reservas WHERE cancha_id = $1', [canchaId]);
      await pool.query('DELETE FROM canchas WHERE id = $1', [canchaId]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [ids]);
      await pool.end();
    });

    // ------------------------------------------------------------------ US-27
    describe('US-27 · perfil', () => {
      it('muestra los datos propios y no los de otro usuario (403)', async () => {
        const propio = await con(request(app).get(`/api/usuarios/${usuarios.ana.id}`), usuarios.ana);
        expect(propio.status).toBe(200);
        expect(propio.body.usuario).toMatchObject({ id: usuarios.ana.id, nombre: 'Usuario ana', correo: usuarios.ana.correo, telefono: '3001234567', rol: 'usuario', correoPendiente: null });
        expect(JSON.stringify(propio.body)).not.toMatch(/password|hash/i);

        const ajeno = await con(request(app).get(`/api/usuarios/${usuarios.luis.id}`), usuarios.ana);
        expect(ajeno.status).toBe(403);
        expect(JSON.stringify(ajeno.body)).not.toContain(usuarios.luis.correo);

        const modificarAjeno = await con(request(app).patch(`/api/usuarios/${usuarios.luis.id}`).send({ nombre: 'Hackeado', telefono: '3009999999' }), usuarios.ana);
        expect(modificarAjeno.status).toBe(403);
        const { rows } = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [usuarios.luis.id]);
        expect(rows[0].nombre).toBe('Usuario luis');
      });

      it('guarda nombre y teléfono válidos y rechaza los inválidos sin guardar nada', async () => {
        const bueno = await con(request(app).patch(`/api/usuarios/${usuarios.ana.id}`).send({ nombre: 'Ana María Pérez', telefono: '+57 310 999 8888' }), usuarios.ana);
        expect(bueno.status).toBe(200);
        expect(bueno.body.usuario).toMatchObject({ nombre: 'Ana María Pérez', telefono: '+573109998888' });

        const malo = await con(request(app).patch(`/api/usuarios/${usuarios.ana.id}`).send({ nombre: '', telefono: 'abc' }), usuarios.ana);
        expect(malo.status).toBe(400);
        expect(malo.body.errores.map((e) => e.campo).sort()).toEqual(['nombre', 'telefono']);

        const { rows } = await pool.query('SELECT nombre, telefono FROM usuarios WHERE id = $1', [usuarios.ana.id]);
        expect(rows[0]).toEqual({ nombre: 'Ana María Pérez', telefono: '+573109998888' });
      });

      it('cambia la contraseña solo con la actual correcta y la nueva cumple las reglas', async () => {
        const incorrecta = await con(request(app).patch(`/api/usuarios/${usuarios.luis.id}/password`).send({ passwordActual: 'Equivocada1', nuevaPassword: 'NuevaClave456' }), usuarios.luis);
        expect(incorrecta.status).toBe(400);
        expect(incorrecta.body.codigo).toBe('PASSWORD_ACTUAL_INCORRECTA');

        const debil = await con(request(app).patch(`/api/usuarios/${usuarios.luis.id}/password`).send({ passwordActual: 'Password123!', nuevaPassword: 'corta' }), usuarios.luis);
        expect(debil.status).toBe(400);

        const buena = await con(request(app).patch(`/api/usuarios/${usuarios.luis.id}/password`).send({ passwordActual: 'Password123!', nuevaPassword: 'NuevaClave456' }), usuarios.luis);
        expect(buena.status).toBe(200);

        const conNueva = await request(app).post('/api/auth/login').send({ correo: usuarios.luis.correo, password: 'NuevaClave456' });
        const conVieja = await request(app).post('/api/auth/login').send({ correo: usuarios.luis.correo, password: 'Password123!' });
        expect(conNueva.status).toBe(200);
        expect(conVieja.status).toBe(401);
      });

      it('el cambio de correo no se aplica hasta verificar el enlace, evita duplicados y el enlace sirve una sola vez', async () => {
        const registro = jest.spyOn(console, 'log').mockImplementation(() => {});
        const nuevo = `nuevo.${sufijo}@test.local`;

        // un correo de otra cuenta se rechaza de entrada
        const duplicado = await con(request(app).post(`/api/usuarios/${usuarios.ana.id}/correo`).send({ nuevoCorreo: usuarios.luis.correo }), usuarios.ana);
        expect(duplicado.status).toBe(409);

        const solicitud = await con(request(app).post(`/api/usuarios/${usuarios.ana.id}/correo`).set('Origin', 'http://localhost:5173').send({ nuevoCorreo: nuevo }), usuarios.ana);
        expect(solicitud.status).toBe(202);

        // todavía no cambió, y el perfil muestra el pendiente
        const { rows: antes } = await pool.query('SELECT correo FROM usuarios WHERE id = $1', [usuarios.ana.id]);
        expect(antes[0].correo).toBe(usuarios.ana.correo);
        const perfil = await con(request(app).get(`/api/usuarios/${usuarios.ana.id}`), usuarios.ana);
        expect(perfil.body.usuario.correoPendiente).toBe(nuevo);

        // el token solo existe en el correo (aquí, en el log del modo desarrollo) y en la base solo su hash
        const linea = registro.mock.calls.map((c) => String(c[0])).find((l) => l.includes('/verificar-correo?token='));
        registro.mockRestore();
        const token = new URL(linea.split('-> ')[1]).searchParams.get('token');
        const { rows: guardado } = await pool.query('SELECT token_hash FROM cambios_correo WHERE usuario_id = $1 AND used_at IS NULL', [usuarios.ana.id]);
        expect(guardado[0].token_hash).not.toBe(token);

        const verificado = await request(app).post('/api/auth/verificar-correo').send({ token });
        expect(verificado.status).toBe(200);
        expect(verificado.body.correo).toBe(nuevo);
        const { rows: despues } = await pool.query('SELECT correo FROM usuarios WHERE id = $1', [usuarios.ana.id]);
        expect(despues[0].correo).toBe(nuevo);
        usuarios.ana.correo = nuevo;

        const reutilizado = await request(app).post('/api/auth/verificar-correo').send({ token });
        expect(reutilizado.status).toBe(400);
        expect((await request(app).post('/api/auth/verificar-correo').send({ token: 'inventado' })).status).toBe(400);
      });
    });

    // ------------------------------------------------------------------ US-28
    describe('US-28 · métodos de pago', () => {
      it('guarda la tarjeta enmascarada y NUNCA el número completo ni el CVV', async () => {
        const metodo = await guardarTarjeta(usuarios.ana);

        expect(metodo).toMatchObject({ marca: 'Visa', ultimos4: '4242', titular: 'Ana Pérez', vencimiento: `12/${String(ANIO).slice(-2)}` });
        expect(JSON.stringify(metodo)).not.toContain('tok_sim');

        const { rows } = await pool.query('SELECT * FROM metodos_pago WHERE id = $1', [metodo.id]);
        const guardado = JSON.stringify(rows[0]);
        expect(rows[0].token).toMatch(/^tok_sim_/);
        expect(guardado).not.toContain('4242424242424242');
        expect(guardado).not.toContain('4242 4242 4242 4242');
        expect(Object.keys(rows[0])).not.toEqual(expect.arrayContaining(['cvv']));
        expect(rows[0].ultimos4).toBe('4242');

        const listado = await con(request(app).get(`/api/usuarios/${usuarios.ana.id}/metodos-pago`), usuarios.ana);
        expect(listado.status).toBe(200);
        expect(listado.body.metodosPago.map((m) => m.id)).toContain(metodo.id);
        expect(JSON.stringify(listado.body)).not.toContain('tok_sim');
      });

      it.each([
        ['número que no pasa Luhn', { numero: '4242 4242 4242 4241' }, 'numero'],
        ['tarjeta vencida', { vencimientoMes: 1, vencimientoAnio: 2020 }, 'vencimientoAnio'],
        ['CVV incorrecto', { cvv: '12' }, 'cvv'],
      ])('rechaza %s con el error del campo y sin exponer datos sensibles', async (_nombre, extra, campo) => {
        const respuesta = await con(request(app).post(`/api/usuarios/${usuarios.ana.id}/metodos-pago`).send(tarjeta(extra)), usuarios.ana);

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.errores.map((e) => e.campo)).toContain(campo);
        const texto = JSON.stringify(respuesta.body);
        expect(texto).not.toContain('4241');
        expect(texto).not.toContain('"123"');
      });

      it('solo el propietario ve y gestiona sus tarjetas', async () => {
        const metodo = await guardarTarjeta(usuarios.ana, { numero: '5555 5555 5555 4444' });

        const verAjenas = await con(request(app).get(`/api/usuarios/${usuarios.ana.id}/metodos-pago`), usuarios.luis);
        expect(verAjenas.status).toBe(403);

        const agregarAjena = await con(request(app).post(`/api/usuarios/${usuarios.ana.id}/metodos-pago`).send(tarjeta()), usuarios.luis);
        expect(agregarAjena.status).toBe(403);

        // con su propio id pero la tarjeta de otro: no existe para él
        const eliminarAjena = await con(request(app).delete(`/api/usuarios/${usuarios.luis.id}/metodos-pago/${metodo.id}`), usuarios.luis);
        expect(eliminarAjena.status).toBe(404);
        const { rows } = await pool.query('SELECT 1 FROM metodos_pago WHERE id = $1', [metodo.id]);
        expect(rows).toHaveLength(1);
      });

      it('al reservar con la tarjeta, el cobro se procesa y queda registrado con la reserva', async () => {
        const metodo = await guardarTarjeta(usuarios.luis);

        const respuesta = await reservar(usuarios.luis, '06:00', '07:00', metodo.id);

        expect(respuesta.status).toBe(201);
        expect(respuesta.body.reserva.estado).toBe('confirmada');
        expect(respuesta.body.reserva.pago).toEqual({ estado: 'aprobado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' });

        const { rows } = await pool.query('SELECT * FROM pagos WHERE reserva_id = $1', [respuesta.body.reserva.id]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ estado: 'aprobado', marca: 'Visa', ultimos4: '4242', moneda: 'COP', usuario_id: usuarios.luis.id });
        expect(Number(rows[0].monto)).toBe(60000);
      });

      it.each([
        ['4000 0000 0000 0002', 'rechazada por el banco', '08:00'],
        ['4000 0000 0000 9995', 'Fondos insuficientes', '09:00'],
      ])('si el pago es rechazado (%s) la reserva NO se confirma y se informa el motivo', async (numero, motivo, hora) => {
        const metodo = await guardarTarjeta(usuarios.luis, { numero });
        const fin = `${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}:00`;

        const respuesta = await reservar(usuarios.luis, hora, fin, metodo.id);

        expect(respuesta.status).toBe(402);
        expect(respuesta.body.codigo).toBe('PAGO_RECHAZADO');
        expect(respuesta.body.mensaje).toContain(motivo);

        const { rows } = await pool.query('SELECT id FROM reservas WHERE cancha_id = $1 AND fecha = $2 AND hora_inicio = $3', [canchaId, FECHA_LEJANA, hora]);
        expect(rows).toHaveLength(0);

        // la franja sigue libre: se puede reservar sin pagar
        const sinPago = await reservar(usuarios.luis, hora, fin);
        expect(sinPago.status).toBe(201);
        expect(sinPago.body.reserva.pago).toBeNull();
      });

      it('no permite pagar con la tarjeta de otro usuario', async () => {
        const deAna = (await con(request(app).get(`/api/usuarios/${usuarios.ana.id}/metodos-pago`), usuarios.ana)).body.metodosPago[0];

        const respuesta = await reservar(usuarios.luis, '12:00', '13:00', deAna.id);

        expect(respuesta.status).toBe(404);
        const { rows } = await pool.query('SELECT id FROM reservas WHERE cancha_id = $1 AND hora_inicio = $2 AND fecha = $3', [canchaId, '12:00', FECHA_LEJANA]);
        expect(rows).toHaveLength(0);
      });

      it('al eliminar la tarjeta desaparece como opción, pero las reservas ya pagadas no se ven afectadas', async () => {
        const metodo = await guardarTarjeta(usuarios.luis, { numero: '3782 822463 10005', cvv: '1234' });
        const pagada = await reservar(usuarios.luis, '14:00', '15:00', metodo.id);
        expect(pagada.status).toBe(201);
        expect(pagada.body.reserva.pago.marca).toBe('American Express');

        const eliminada = await con(request(app).delete(`/api/usuarios/${usuarios.luis.id}/metodos-pago/${metodo.id}`), usuarios.luis);
        expect(eliminada.status).toBe(200);

        const listado = await con(request(app).get(`/api/usuarios/${usuarios.luis.id}/metodos-pago`), usuarios.luis);
        expect(listado.body.metodosPago.map((m) => m.id)).not.toContain(metodo.id);

        const { rows: pago } = await pool.query('SELECT estado, marca, ultimos4, metodo_pago_id FROM pagos WHERE reserva_id = $1', [pagada.body.reserva.id]);
        expect(pago[0]).toEqual({ estado: 'aprobado', marca: 'American Express', ultimos4: '0005', metodo_pago_id: null });
        const { rows: reserva } = await pool.query('SELECT estado FROM reservas WHERE id = $1', [pagada.body.reserva.id]);
        expect(reserva[0].estado).toBe('confirmada');

        // intentar pagar con la tarjeta eliminada ya no es posible
        const otra = await reservar(usuarios.luis, '16:00', '17:00', metodo.id);
        expect(otra.status).toBe(404);
      });
    });

    // ------------------------------------------------------------------ US-14
    describe('US-14 · cancelación de reserva propia', () => {
      it('cancela con más de 2 horas, libera la franja de inmediato y reembolsa el pago', async () => {
        const metodo = await guardarTarjeta(usuarios.ana);
        const creada = await reservar(usuarios.ana, '18:00', '19:00', metodo.id);
        expect(creada.status).toBe(201);
        const id = creada.body.reserva.id;

        const cancelada = await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana);

        expect(cancelada.status).toBe(200);
        expect(cancelada.body.reserva.estado).toBe('cancelada');
        expect(cancelada.body.reembolso).toEqual({ estado: 'reembolsado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' });
        const { rows } = await pool.query('SELECT estado, reembolso_referencia FROM pagos WHERE reserva_id = $1', [id]);
        expect(rows[0].estado).toBe('reembolsado');
        expect(rows[0].reembolso_referencia).toMatch(/^ref_sim_/);

        // la franja quedó disponible: otro usuario la reserva y ya no figura como ocupada
        const disponibilidad = await con(request(app).get(`/api/canchas/${canchaId}/disponibilidad`).query({ fecha: FECHA_LEJANA }), usuarios.luis);
        expect(disponibilidad.body.ocupados.map((o) => String(o.horaInicio).slice(0, 5))).not.toContain('18:00');
        const otro = await reservar(usuarios.luis, '18:00', '19:00');
        expect(otro.status).toBe(201);
      });

      it('una reserva sin pago se cancela sin reembolso', async () => {
        const creada = await reservar(usuarios.ana, '19:00', '20:00');
        const cancelada = await con(request(app).patch(`/api/reservas/${creada.body.reserva.id}/cancelar`), usuarios.ana);

        expect(cancelada.status).toBe(200);
        expect(cancelada.body.reembolso).toBeNull();
      });

      it('bloquea la cancelación si faltan menos de 2 horas y explica la restricción', async () => {
        const pronto = rangoDesdeAhora(90);
        const { id } = await insertarReserva(usuarios.ana, pronto.fecha, pronto.inicio, pronto.fin);

        const respuesta = await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana);

        expect(respuesta.status).toBe(409);
        expect(respuesta.body.codigo).toBe('CANCELACION_FUERA_DE_PLAZO');
        expect(respuesta.body.mensaje).toContain('2 horas');
        const { rows } = await pool.query('SELECT estado FROM reservas WHERE id = $1', [id]);
        expect(rows[0].estado).toBe('confirmada');
      });

      it('con más de 2 horas de anticipación (hoy) sí se puede cancelar', async () => {
        const lejos = rangoDesdeAhora(180);
        const { id } = await insertarReserva(usuarios.ana, lejos.fecha, lejos.inicio, lejos.fin);

        const respuesta = await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana);

        expect(respuesta.status).toBe(200);
      });

      it('no permite cancelar la reserva de otro usuario (403) ni la modifica', async () => {
        const creada = await reservar(usuarios.luis, '20:00', '21:00');
        const id = creada.body.reserva.id;

        const respuesta = await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana);

        expect(respuesta.status).toBe(403);
        const { rows } = await pool.query('SELECT estado FROM reservas WHERE id = $1', [id]);
        expect(rows[0].estado).toBe('confirmada');
      });

      it('no se puede cancelar dos veces', async () => {
        const creada = await reservar(usuarios.ana, '21:00', '22:00');
        const id = creada.body.reserva.id;

        expect((await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana)).status).toBe(200);
        expect((await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.ana)).status).toBe(409);
      });

      it('el historial indica si todavía se puede cancelar y el estado del pago', async () => {
        const metodo = await guardarTarjeta(usuarios.ana, { numero: '5555555555554444' });
        const lejana = await reservar(usuarios.ana, '10:00', '11:00', metodo.id, '2099-09-01');
        const pronto = rangoDesdeAhora(60);
        const cercana = await insertarReserva(usuarios.ana, pronto.fecha, pronto.inicio, pronto.fin);

        const respuesta = await con(request(app).get('/api/reservas').query({ periodo: 'proximas', limite: 50 }), usuarios.ana);
        const porId = Object.fromEntries(respuesta.body.reservas.map((r) => [r.id, r]));

        expect(porId[lejana.body.reserva.id]).toMatchObject({ puedeCancelar: true, pago: { estado: 'aprobado', marca: 'Mastercard', ultimos4: '4444' } });
        expect(porId[cercana.id]).toMatchObject({ puedeCancelar: false, pago: null });
      });
    });

    // ------------------------------------------------------------------ US-16 + US-28
    describe('US-16 · cancelación administrativa de una reserva pagada con tarjeta', () => {
      it('la cancela con motivo, libera la franja, reembolsa el pago y deja la auditoría', async () => {
        const metodo = await guardarTarjeta(usuarios.luis, { numero: '4012 8888 8888 1881' });
        const creada = await reservar(usuarios.luis, '17:00', '18:00', metodo.id, '2099-11-01');
        expect(creada.status).toBe(201);
        const id = creada.body.reserva.id;

        const cancelada = await con(request(app).patch(`/api/admin/reservas/${id}/cancelar`).send({ motivo: 'Mantenimiento de la cancha' }), usuarios.admin);

        expect(cancelada.status).toBe(200);
        expect(cancelada.body.reserva.estado).toBe('cancelada_administrativamente');
        const { rows: pago } = await pool.query('SELECT estado, reembolso_referencia FROM pagos WHERE reserva_id = $1', [id]);
        expect(pago[0].estado).toBe('reembolsado');
        expect(pago[0].reembolso_referencia).toMatch(/^ref_sim_/);
        const { rows: auditoria } = await pool.query('SELECT administrador_id, motivo FROM cancelaciones_administrativas WHERE reserva_id = $1', [id]);
        expect(auditoria).toEqual([{ administrador_id: usuarios.admin.id, motivo: 'Mantenimiento de la cancha' }]);

        // la franja queda libre y el usuario ve el motivo en su historial
        const otro = await reservar(usuarios.ana, '17:00', '18:00', null, '2099-11-01');
        expect(otro.status).toBe(201);
        const historial = await con(request(app).get('/api/reservas').query({ limite: 50 }), usuarios.luis);
        expect(historial.body.reservas.find((x) => x.id === id)).toMatchObject({ estado: 'cancelada_administrativamente', motivoCancelacion: 'Mantenimiento de la cancha', puedeCancelar: false });
      });

      it('exige motivo y rol de administrador, y una reserva cancelada así ya no se puede cancelar de nuevo', async () => {
        const creada = await reservar(usuarios.luis, '18:00', '19:00', null, '2099-11-02');
        const id = creada.body.reserva.id;

        const sinMotivo = await con(request(app).patch(`/api/admin/reservas/${id}/cancelar`).send({}), usuarios.admin);
        expect(sinMotivo.status).toBe(400);
        const noAdmin = await con(request(app).patch(`/api/admin/reservas/${id}/cancelar`).send({ motivo: 'x' }), usuarios.ana);
        expect(noAdmin.status).toBe(403);

        expect((await con(request(app).patch(`/api/admin/reservas/${id}/cancelar`).send({ motivo: 'Imprevisto' }), usuarios.admin)).status).toBe(200);
        expect((await con(request(app).patch(`/api/reservas/${id}/cancelar`), usuarios.luis)).status).toBe(409);
        expect((await verificarAdmin(id)).body).toMatchObject({ estado: 'no_vigente', motivo: 'cancelada' });
      });

      async function verificarAdmin(id) {
        const { rows } = await pool.query('SELECT codigo FROM reservas WHERE id = $1', [id]);
        return con(request(app).post('/api/admin/reservas/verificar').send({ codigo: rows[0].codigo }), usuarios.admin);
      }
    });

    // ------------------------------------------------------------------ US-29
    describe('US-29 · verificación del código de reserva (administrador)', () => {
      const verificar = (usuario, codigo) => con(request(app).post('/api/admin/reservas/verificar').send({ codigo }), usuario);
      const usar = (usuario, codigo) => con(request(app).post(`/api/admin/reservas/${codigo}/usar`), usuario);

      it('cada reserva tiene un código único, el mismo que ve el usuario', async () => {
        const creada = await reservar(usuarios.luis, '07:00', '08:00', null, '2099-10-01');
        const { reserva } = creada.body;

        expect(reserva.codigo).toBe(`CY-${reserva.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`);
        const { rows } = await pool.query('SELECT codigo FROM reservas WHERE id = $1', [reserva.id]);
        expect(rows[0].codigo).toBe(reserva.codigo);

        const { rows: indice } = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_reservas_codigo'");
        expect(indice[0].indexdef).toContain('UNIQUE');

        const historial = await con(request(app).get('/api/reservas').query({ limite: 50 }), usuarios.luis);
        expect(historial.body.reservas.find((r) => r.id === reserva.id).codigo).toBe(reserva.codigo);
      });

      it('una reserva confirmada que no ha vencido es "Vigente", con cancha, fecha, horario y nombre del usuario', async () => {
        const { body } = await reservar(usuarios.luis, '09:00', '10:00', null, '2099-10-02');

        const respuesta = await verificar(usuarios.admin, body.reserva.codigo.toLowerCase());

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toMatchObject({
          estado: 'vigente',
          motivo: null,
          reserva: { codigo: body.reserva.codigo, fecha: '2099-10-02', horaInicio: '09:00', horaFin: '10:00', usuario: { nombre: 'Usuario luis' }, cancha: { nombre: `Cancha integración ${sufijo}` } },
        });
        expect(JSON.stringify(respuesta.body)).not.toContain(usuarios.luis.correo);
      });

      it('una reserva cancelada es "No vigente" por cancelada', async () => {
        const { body } = await reservar(usuarios.luis, '10:00', '11:00', null, '2099-10-03');
        await con(request(app).patch(`/api/reservas/${body.reserva.id}/cancelar`), usuarios.luis);

        const respuesta = await verificar(usuarios.admin, body.reserva.codigo);

        expect(respuesta.body).toMatchObject({ estado: 'no_vigente', motivo: 'cancelada' });
      });

      it('una reserva vencida es "No vigente" por vencida', async () => {
        const { codigo } = await insertarReserva(usuarios.luis, '2000-01-10', '10:00', '11:00');

        const respuesta = await verificar(usuarios.admin, codigo);

        expect(respuesta.body).toMatchObject({ estado: 'no_vigente', motivo: 'vencida' });
      });

      it('marcada como utilizada, el código ya no puede validarse como vigente y no se puede marcar otra vez', async () => {
        const { body } = await reservar(usuarios.luis, '11:00', '12:00', null, '2099-10-04');
        const codigo = body.reserva.codigo;

        expect((await verificar(usuarios.admin, codigo)).body.estado).toBe('vigente');

        const marcada = await usar(usuarios.admin, codigo);
        expect(marcada.status).toBe(200);
        expect(marcada.body).toMatchObject({ estado: 'no_vigente', motivo: 'usada' });

        expect((await verificar(usuarios.admin, codigo)).body).toMatchObject({ estado: 'no_vigente', motivo: 'usada' });
        const otraVez = await usar(usuarios.admin, codigo);
        expect(otraVez.status).toBe(409);
        expect(otraVez.body.codigo).toBe('RESERVA_NO_VIGENTE');
      });

      it('si dos administradores la marcan a la vez, solo uno lo logra', async () => {
        const { body } = await reservar(usuarios.luis, '12:00', '13:00', null, '2099-10-05');

        const [uno, dos] = await Promise.all([usar(usuarios.admin, body.reserva.codigo), usar(usuarios.admin, body.reserva.codigo)]);

        expect([uno.status, dos.status].sort()).toEqual([200, 409]);
      });

      it('un código inexistente o con formato inválido responde "Código no encontrado" sin revelar nada', async () => {
        for (const codigo of ['CY-00000000', 'CY-ZZZZZZZZ', 'abc', "' OR 1=1 --", 'CY-1234']) {
          const respuesta = await verificar(usuarios.admin, codigo);

          expect(respuesta.status).toBe(404);
          expect(respuesta.body).toEqual({ mensaje: 'Código no encontrado', codigo: 'CODIGO_NO_ENCONTRADO' });
        }
      });

      it('un usuario sin rol de administrador recibe 403 en todas las rutas del panel', async () => {
        const { body } = await reservar(usuarios.luis, '13:00', '14:00', null, '2099-10-06');

        expect((await verificar(usuarios.luis, body.reserva.codigo)).status).toBe(403);
        expect((await usar(usuarios.luis, body.reserva.codigo)).status).toBe(403);
        expect((await con(request(app).get('/api/admin/verificaciones'), usuarios.luis)).status).toBe(403);
        expect((await request(app).get('/api/admin/verificaciones')).status).toBe(401);

        const { rows } = await pool.query('SELECT usada_at FROM reservas WHERE id = $1', [body.reserva.id]);
        expect(rows[0].usada_at).toBeNull();
      });

      it('el rol se lee de la base: un usuario que deja de ser administrador pierde el acceso de inmediato', async () => {
        const temporal = await crearUsuario('temporal', 'administrador');
        expect((await con(request(app).get('/api/admin/verificaciones'), temporal)).status).toBe(200);

        await pool.query("UPDATE usuarios SET rol = 'usuario' WHERE id = $1", [temporal.id]);

        expect((await con(request(app).get('/api/admin/verificaciones'), temporal)).status).toBe(403);
      });

      it('cada verificación queda registrada con administrador, código, resultado y fecha', async () => {
        const { body } = await reservar(usuarios.luis, '15:00', '16:00', null, '2099-10-07');
        const codigo = body.reserva.codigo;

        await verificar(usuarios.admin, codigo);
        await usar(usuarios.admin, codigo);
        await verificar(usuarios.admin, 'CY-FFFFFFFF');

        const { rows } = await pool.query(
          `SELECT administrador_id, codigo, resultado, reserva_id, created_at
           FROM verificaciones_reserva WHERE administrador_id = $1 AND codigo = ANY($2) ORDER BY created_at`,
          [usuarios.admin.id, [codigo, 'CY-FFFFFFFF']]
        );
        expect(rows.map((r) => r.resultado)).toEqual(['vigente', 'marcada_usada', 'no_encontrado']);
        expect(rows[0]).toMatchObject({ administrador_id: usuarios.admin.id, codigo, reserva_id: body.reserva.id });
        expect(rows[2].reserva_id).toBeNull();
        expect(rows.every((r) => r.created_at instanceof Date)).toBe(true);

        const auditoria = await con(request(app).get('/api/admin/verificaciones').query({ limite: 10 }), usuarios.admin);
        expect(auditoria.status).toBe(200);
        expect(auditoria.body.verificaciones[0]).toMatchObject({ administrador: 'Usuario admin', codigo: 'CY-FFFFFFFF', resultado: 'no_encontrado' });
      });

      it('el registro público nunca crea administradores', async () => {
        const respuesta = await request(app).post('/api/auth/registro').send({ nombre: 'Intruso', correo: `intruso.${sufijo}@test.local`, telefono: '3001234567', password: 'Password123!', rol: 'administrador' });
        expect(respuesta.status).toBe(201);

        const { rows } = await pool.query('SELECT rol FROM usuarios WHERE correo = $1', [`intruso.${sufijo}@test.local`]);
        expect(rows[0].rol).toBe('usuario');
        await pool.query('DELETE FROM usuarios WHERE correo = $1', [`intruso.${sufijo}@test.local`]);
      });
    });
  });
}
