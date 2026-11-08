// US-16: cancelación administrativa. Pruebas con repositorios simulados (no necesitan base de datos).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sin:uso@localhost:5432/sin_uso';
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn(), on: jest.fn() }));
jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/pagoRepository');
jest.mock('../src/repositories/horarioRepository');
jest.mock('../src/repositories/sesionReservaRepository');
jest.mock('../src/repositories/usuarioRepository', () => ({ buscarPorId: jest.fn() }));
jest.mock('../src/services/emailService', () => ({
  enviarCorreoConfirmacionReserva: jest.fn(),
  enviarCorreoCancelacionAdministrativa: jest.fn(),
}));
jest.mock('../src/services/retencionService', () => ({
  verificarDisponibleParaReservar: jest.fn(),
  convertirEnReserva: jest.fn(),
  notificarFranjaLiberada: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { generarToken } = require('../src/utils/jwt');
const canchaRepository = require('../src/repositories/canchaRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const emailService = require('../src/services/emailService');
const retencionService = require('../src/services/retencionService');
const reservaService = require('../src/services/reservaService');
const pagoRepository = require('../src/repositories/pagoRepository');
const pagoService = require('../src/services/pagoService');

const esperarTareasPendientes = () => new Promise((resolve) => setImmediate(resolve));

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const RESERVA_ID = '33333333-3333-4333-8333-333333333333';
const CANCHA_ID = '44444444-4444-4444-8444-444444444444';

// "Ahora" fijo: 2026-10-22 08:00 hora de Colombia. Las pruebas no dependen del reloj real.
const AHORA = new Date('2026-10-22T08:00:00-05:00').getTime();

function reservaConfirmada(horaInicio) {
  return {
    id: RESERVA_ID,
    codigo: 'CY-33333333',
    canchaId: CANCHA_ID,
    usuarioId: USUARIO_ID,
    fecha: '2026-10-22',
    horaInicio,
    horaFin: '23:00:00',
    estado: 'confirmada',
  };
}

describe('reservaService.cancelarReservaComoAdmin (US-16)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    usuarioRepository.buscarPorId.mockResolvedValue({ id: USUARIO_ID, nombre: 'Ana', correo: 'ana@test.local' });
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' });
    emailService.enviarCorreoCancelacionAdministrativa.mockResolvedValue({ simulado: true });
  });

  const cancelar = (extra = {}) =>
    reservaService.cancelarReservaComoAdmin({ id: RESERVA_ID, administradorId: ADMIN_ID, motivo: 'Mantenimiento', ahora: AHORA, ...extra });

  it('reembolsa por completo (dentro de la misma transacción) una reserva pagada con tarjeta que cancela un administrador', async () => {
    const pago = { id: 'pago-1', estado: 'aprobado', reservaId: RESERVA_ID };
    const cliente = { query: jest.fn() };
    const reembolsarSpy = jest.spyOn(pagoService, 'reembolsar').mockResolvedValue({ ...pago, estado: 'reembolsado' });
    pagoRepository.obtenerPorReserva.mockResolvedValue(pago);
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('12:00:00'));
    reservaRepository.cancelarAdministrativamente.mockImplementation(async (datos, enTransaccion) => {
      await enTransaccion(cliente);
      return { ...reservaConfirmada('12:00:00'), estado: 'cancelada_administrativamente' };
    });

    await cancelar();
    await esperarTareasPendientes();

    expect(reembolsarSpy).toHaveBeenCalledWith(cliente, pago);
    reembolsarSpy.mockRestore();
  });

  it('si el reembolso falla, la cancelación administrativa no se confirma', async () => {
    const pago = { id: 'pago-1', estado: 'aprobado', reservaId: RESERVA_ID };
    const reembolsarSpy = jest.spyOn(pagoService, 'reembolsar').mockRejectedValue(new Error('pasarela caída'));
    pagoRepository.obtenerPorReserva.mockResolvedValue(pago);
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('12:00:00'));
    reservaRepository.cancelarAdministrativamente.mockImplementation(async (datos, enTransaccion) => {
      await enTransaccion({});
      return { ...reservaConfirmada('12:00:00'), estado: 'cancelada_administrativamente' };
    });

    await expect(cancelar()).rejects.toThrow('pasarela caída');
    expect(retencionService.notificarFranjaLiberada).not.toHaveBeenCalled();
    expect(emailService.enviarCorreoCancelacionAdministrativa).not.toHaveBeenCalled();
    reembolsarSpy.mockRestore();
  });

  it('cancela una reserva con más de 2 horas de anticipación, notifica y envía el correo con el motivo', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('12:00:00'));
    reservaRepository.cancelarAdministrativamente.mockResolvedValue({
      ...reservaConfirmada('12:00:00'),
      estado: 'cancelada_administrativamente',
    });

    const reserva = await cancelar();
    await esperarTareasPendientes();

    expect(reserva.estado).toBe('cancelada_administrativamente');
    expect(reservaRepository.cancelarAdministrativamente).toHaveBeenCalledWith({
      id: RESERVA_ID,
      administradorId: ADMIN_ID,
      motivo: 'Mantenimiento',
    }, undefined);
    expect(retencionService.notificarFranjaLiberada).toHaveBeenCalledWith(USUARIO_ID, reserva);
    expect(emailService.enviarCorreoCancelacionAdministrativa).toHaveBeenCalledWith(
      expect.objectContaining({ para: 'ana@test.local', motivo: 'Mantenimiento' })
    );
  });

  it('permite cancelar exactamente 2 horas antes del inicio', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('10:00:00'));
    reservaRepository.cancelarAdministrativamente.mockResolvedValue({ ...reservaConfirmada('10:00:00'), estado: 'cancelada_administrativamente' });

    await expect(cancelar()).resolves.toMatchObject({ estado: 'cancelada_administrativamente' });
  });

  it('bloquea con 409 y explica la restricción si faltan menos de 2 horas', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('09:59:00'));

    await expect(cancelar()).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'CANCELACION_FUERA_DE_PLAZO',
      message: expect.stringContaining('menos de 2 horas'),
    });
    expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
    expect(emailService.enviarCorreoCancelacionAdministrativa).not.toHaveBeenCalled();
  });

  it('bloquea una reserva que ya comenzó', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('07:00:00'));

    await expect(cancelar()).rejects.toMatchObject({ statusCode: 409, codigo: 'CANCELACION_FUERA_DE_PLAZO' });
  });

  it.each([undefined, null, '', '   ', 42])('exige un motivo (valor: %p) y no consulta nada', async (motivo) => {
    await expect(cancelar({ motivo })).rejects.toMatchObject({ statusCode: 400, codigo: 'MOTIVO_OBLIGATORIO' });
    expect(reservaRepository.obtenerPorId).not.toHaveBeenCalled();
  });

  it('rechaza un motivo de más de 500 caracteres', async () => {
    await expect(cancelar({ motivo: 'x'.repeat(501) })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('devuelve 404 si la reserva no existe', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(null);

    await expect(cancelar()).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['cancelada', 'cancelada_administrativamente'])('devuelve 409 si la reserva ya estaba %s', async (estado) => {
    reservaRepository.obtenerPorId.mockResolvedValue({ ...reservaConfirmada('12:00:00'), estado });

    await expect(cancelar()).rejects.toMatchObject({ statusCode: 409 });
    expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
  });

  it('devuelve 409 si otra cancelación se adelantó entre la lectura y la escritura', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('12:00:00'));
    reservaRepository.cancelarAdministrativamente.mockResolvedValue(null);

    await expect(cancelar()).rejects.toMatchObject({ statusCode: 409 });
    expect(emailService.enviarCorreoCancelacionAdministrativa).not.toHaveBeenCalled();
  });

  it('si el correo falla, la cancelación igual se completa', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    reservaRepository.obtenerPorId.mockResolvedValue(reservaConfirmada('12:00:00'));
    reservaRepository.cancelarAdministrativamente.mockResolvedValue({ ...reservaConfirmada('12:00:00'), estado: 'cancelada_administrativamente' });
    emailService.enviarCorreoCancelacionAdministrativa.mockRejectedValue(new Error('SMTP caído'));

    await expect(cancelar()).resolves.toMatchObject({ estado: 'cancelada_administrativamente' });
    await esperarTareasPendientes();
    console.error.mockRestore();
  });

  it('el usuario ya no puede cancelar por su cuenta una reserva cancelada administrativamente', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({ ...reservaConfirmada('12:00:00'), estado: 'cancelada_administrativamente' });

    await expect(reservaService.cancelarReserva(RESERVA_ID, USUARIO_ID)).rejects.toMatchObject({ statusCode: 409 });
    expect(reservaRepository.cancelar).not.toHaveBeenCalled();
  });
});

describe('reservaService.listarReservasAdmin (US-16)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    reservaRepository.listarFuturasParaAdmin.mockResolvedValue({ reservas: [], total: 45 });
  });

  it('transmite los filtros, recorta los espacios del usuario y calcula la paginación', async () => {
    const resultado = await reservaService.listarReservasAdmin({ canchaId: CANCHA_ID, fecha: '2026-10-22', usuario: '  ana ', pagina: 2, limite: 20 });

    expect(reservaRepository.listarFuturasParaAdmin).toHaveBeenCalledWith({
      canchaId: CANCHA_ID,
      fecha: '2026-10-22',
      usuario: 'ana',
      limite: 20,
      offset: 20,
    });
    expect(resultado.paginacion).toEqual({ pagina: 2, limite: 20, total: 45, totalPaginas: 3 });
  });

  it('sin filtros consulta todo con valores por defecto', async () => {
    await reservaService.listarReservasAdmin({});

    expect(reservaRepository.listarFuturasParaAdmin).toHaveBeenCalledWith({
      canchaId: null,
      fecha: null,
      usuario: null,
      limite: 20,
      offset: 0,
    });
  });
});

describe('Rutas /api/admin/reservas (US-16)', () => {
  const tokenUsuario = (id) => `Bearer ${generarToken({ sub: id })}`;

  beforeEach(() => {
    jest.resetAllMocks();
    usuarioRepository.buscarPorId.mockImplementation(async (id) => ({
      id,
      nombre: id === ADMIN_ID ? 'Admin' : 'Ana',
      correo: 'x@test.local',
      rol: id === ADMIN_ID ? 'administrador' : 'usuario',
    }));
    reservaRepository.listarFuturasParaAdmin.mockResolvedValue({ reservas: [], total: 0 });
  });

  it('rechaza con 401 si no hay sesión', async () => {
    await request(app).get('/api/admin/reservas').expect(401);
    await request(app).patch(`/api/admin/reservas/${RESERVA_ID}/cancelar`).send({ motivo: 'x' }).expect(401);
  });

  it('rechaza con 403 a un usuario que no es administrador', async () => {
    await request(app).get('/api/admin/reservas').set('Authorization', tokenUsuario(USUARIO_ID)).expect(403);
    await request(app)
      .patch(`/api/admin/reservas/${RESERVA_ID}/cancelar`)
      .set('Authorization', tokenUsuario(USUARIO_ID))
      .send({ motivo: 'x' })
      .expect(403);
    expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
  });

  it('un administrador puede listar con filtros', async () => {
    const respuesta = await request(app)
      .get(`/api/admin/reservas?canchaId=${CANCHA_ID}&fecha=2026-10-22&usuario=ana`)
      .set('Authorization', tokenUsuario(ADMIN_ID))
      .expect(200);

    expect(respuesta.body.paginacion).toMatchObject({ pagina: 1, total: 0 });
    expect(reservaRepository.listarFuturasParaAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ canchaId: CANCHA_ID, fecha: '2026-10-22', usuario: 'ana' })
    );
  });

  it('valida los filtros del listado', async () => {
    await request(app).get('/api/admin/reservas?canchaId=no-uuid').set('Authorization', tokenUsuario(ADMIN_ID)).expect(400);
    await request(app).get('/api/admin/reservas?fecha=ayer').set('Authorization', tokenUsuario(ADMIN_ID)).expect(400);
  });

  it('exige el motivo al cancelar (400) y no cancela', async () => {
    const respuesta = await request(app)
      .patch(`/api/admin/reservas/${RESERVA_ID}/cancelar`)
      .set('Authorization', tokenUsuario(ADMIN_ID))
      .send({ motivo: '   ' })
      .expect(400);

    expect(respuesta.body.errores[0].mensaje).toMatch(/motivo/i);
    expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
  });

  it('rechaza un id de reserva que no es UUID', async () => {
    await request(app)
      .patch('/api/admin/reservas/123/cancelar')
      .set('Authorization', tokenUsuario(ADMIN_ID))
      .send({ motivo: 'Mantenimiento' })
      .expect(400);
  });

  it('un administrador cancela una reserva futura y queda registrado quién la canceló', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({ ...reservaConfirmada('12:00:00'), fecha: '2099-12-31' });
    reservaRepository.cancelarAdministrativamente.mockResolvedValue({
      ...reservaConfirmada('12:00:00'),
      fecha: '2099-12-31',
      estado: 'cancelada_administrativamente',
    });
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' });
    emailService.enviarCorreoCancelacionAdministrativa.mockResolvedValue({ simulado: true });

    const respuesta = await request(app)
      .patch(`/api/admin/reservas/${RESERVA_ID}/cancelar`)
      .set('Authorization', tokenUsuario(ADMIN_ID))
      .send({ motivo: '  Cancha en mantenimiento  ' })
      .expect(200);

    expect(respuesta.body.reserva.estado).toBe('cancelada_administrativamente');
    expect(reservaRepository.cancelarAdministrativamente).toHaveBeenCalledWith({
      id: RESERVA_ID,
      administradorId: ADMIN_ID,
      motivo: 'Cancha en mantenimiento',
    }, undefined);
    await esperarTareasPendientes();
  });
});

describe('emailService.enviarCorreoCancelacionAdministrativa (US-16)', () => {
  it('incluye el motivo y escapa el HTML para que no se inyecte en el correo', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    let real;

    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));
      jest.doMock('../src/config/env', () => ({ smtp: { host: 'h', port: 587, user: 'u', pass: 'p', from: 'CanchaYa <no-reply@test.local>' } }));
      real = jest.requireActual('../src/services/emailService');
    });

    await real.enviarCorreoCancelacionAdministrativa({
      para: 'ana@test.local',
      nombre: '<b>Ana</b>',
      reserva: { codigo: 'CY-1', fecha: '2099-12-31', horaInicio: '10:00:00', horaFin: '11:00:00', cancha: { nombre: 'C', direccion: 'D' } },
      motivo: '<script>alert(1)</script> Mantenimiento',
    });

    const { to, subject, html } = sendMail.mock.calls[0][0];
    expect(to).toBe('ana@test.local');
    expect(subject).toContain('CY-1');
    expect(html).toContain('Mantenimiento');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Ana</b>');
  });
});

describe('Reserva.aHistorial: motivo de la cancelación (US-16)', () => {
  const Reserva = require('../src/models/Reserva');
  const fila = { id: RESERVA_ID, cancha_id: CANCHA_ID, estado_visible: 'cancelada_administrativamente', fecha_texto: '2026-10-22', hora_inicio_texto: '10:00', hora_fin_texto: '11:00' };

  it('incluye el motivo cuando existe', () => {
    expect(Reserva.aHistorial({ ...fila, motivo_cancelacion: 'Mantenimiento' }).motivoCancelacion).toBe('Mantenimiento');
  });

  it('es null cuando la reserva no fue cancelada por un administrador', () => {
    expect(Reserva.aHistorial({ ...fila, estado_visible: 'confirmada', motivo_cancelacion: null }).motivoCancelacion).toBeNull();
    expect(Reserva.aHistorial({ ...fila, estado_visible: 'confirmada' }).motivoCancelacion).toBeNull();
  });
});
