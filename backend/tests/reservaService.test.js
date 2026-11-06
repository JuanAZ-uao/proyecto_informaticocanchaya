jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/horarioRepository');
jest.mock('../src/repositories/usuarioRepository', () => ({ buscarPorId: jest.fn() }));
jest.mock('../src/repositories/pagoRepository');
jest.mock('../src/repositories/metodoPagoRepository');
jest.mock('../src/services/emailService', () => ({ enviarCorreoConfirmacionReserva: jest.fn(), enviarCorreoCancelacionReserva: jest.fn() }));
jest.mock('../src/repositories/sesionReservaRepository');
jest.mock('../src/services/retencionService', () => ({
  verificarDisponibleParaReservar: jest.fn(),
  convertirEnReserva: jest.fn(),
  notificarFranjaLiberada: jest.fn(),
}));

const canchaRepository = require('../src/repositories/canchaRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const horarioRepository = require('../src/repositories/horarioRepository');
const emailService = require('../src/services/emailService');
const temporizadorService = require('../src/services/temporizadorReservaService');
const retencionService = require('../src/services/retencionService');
const reservaService = require('../src/services/reservaService');

const esperarTareasPendientes = () => new Promise((resolve) => setImmediate(resolve));

const CANCHA_ID = 'cancha-1';
const USUARIO_ID = 'usuario-1';
// Fecha lejana fija: nunca vence (no depende de la fecha en que se ejecuten las pruebas).
const FECHA_FUTURA = '2099-12-31';
const HORARIO_DIARIO = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '06:00:00', horaFin: '22:00:00' }));

describe('reservaService.crearReserva', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' });
    usuarioRepository.buscarPorId.mockResolvedValue({ id: USUARIO_ID, nombre: 'Ana', correo: 'ana@test.local' });
    emailService.enviarCorreoConfirmacionReserva.mockResolvedValue({ simulado: true });
    retencionService.verificarDisponibleParaReservar.mockResolvedValue(undefined);
    retencionService.convertirEnReserva.mockResolvedValue(undefined);
    horarioRepository.listarPorCancha.mockResolvedValue(HORARIO_DIARIO);
    reservaRepository.existeSolapadaDeUsuario.mockResolvedValue(false);
    reservaRepository.contarActivasPorUsuario.mockResolvedValue(0);
  });

  it('US-18: rechaza con 409 si otro usuario tiene la franja retenida, sin crear la reserva', async () => {
    const ErrorDeAplicacion = require('../src/utils/ErrorDeAplicacion');
    retencionService.verificarDisponibleParaReservar.mockRejectedValue(
      new ErrorDeAplicacion('Otro usuario está reservando esta franja en este momento', 409, 'FRANJA_RETENIDA')
    );

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({ statusCode: 409 });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('US-18: al confirmar, la retención se convierte en reserva definitiva', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(retencionService.convertirEnReserva).toHaveBeenCalledWith(USUARIO_ID, CANCHA_ID, reserva);
  });

  const datosReserva = {
    canchaId: CANCHA_ID,
    usuarioId: USUARIO_ID,
    fecha: FECHA_FUTURA,
    horaInicio: '08:00',
    horaFin: '09:00',
  };

  it('crea la reserva cuando la cancha existe y la franja está libre', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.id).toBe('reserva-1');
    expect(reservaRepository.crear).toHaveBeenCalledWith(datosReserva, undefined);
  });

  it('US-11: devuelve la reserva confirmada con los datos de la cancha', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', codigo: 'CY-RESERVA1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva).toMatchObject({
      codigo: 'CY-RESERVA1',
      estado: 'confirmada',
      cancha: { id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' },
    });
  });

  it('US-11: al confirmar, finaliza el temporizador del usuario en esa cancha', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });
    const espia = jest.spyOn(temporizadorService, 'finalizarSesion');

    await reservaService.crearReserva(datosReserva);

    expect(espia).toHaveBeenCalledWith(USUARIO_ID, CANCHA_ID);
    espia.mockRestore();
  });

  it('US-11: envía el correo de confirmación con el resumen al correo del usuario', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', codigo: 'CY-RESERVA1', ...datosReserva, estado: 'confirmada' });

    await reservaService.crearReserva(datosReserva);
    await esperarTareasPendientes();

    expect(emailService.enviarCorreoConfirmacionReserva).toHaveBeenCalledWith(
      expect.objectContaining({ para: 'ana@test.local', reserva: expect.objectContaining({ codigo: 'CY-RESERVA1' }) })
    );
  });

  it('US-11: si el correo falla, la reserva igual queda confirmada', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });
    emailService.enviarCorreoConfirmacionReserva.mockRejectedValue(new Error('SMTP caído'));
    const errorConsola = jest.spyOn(console, 'error').mockImplementation(() => {});

    const reserva = await reservaService.crearReserva(datosReserva);
    await esperarTareasPendientes();

    expect(reserva.estado).toBe('confirmada');
    expect(errorConsola).toHaveBeenCalled();
    errorConsola.mockRestore();
  });

  it('US-11: si la reserva no se guarda, no envía correo', async () => {
    const errorPostgres = new Error('duplicate key');
    errorPostgres.code = '23505';
    reservaRepository.crear.mockRejectedValue(errorPostgres);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({ statusCode: 409 });
    await esperarTareasPendientes();

    expect(emailService.enviarCorreoConfirmacionReserva).not.toHaveBeenCalled();
  });

  it('lanza 404 si la cancha no existe', async () => {
    canchaRepository.obtenerPorId.mockResolvedValue(null);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({ statusCode: 404 });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('lanza 400 si horaFin no es posterior a horaInicio', async () => {
    await expect(
      reservaService.crearReserva({ ...datosReserva, horaFin: '08:00' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('US-12: rechaza con 409 si el usuario ya tiene una reserva que se solapa en el horario, sin crearla', async () => {
    reservaRepository.existeSolapadaDeUsuario.mockResolvedValue(true);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ya tienes una reserva en ese horario',
    });
    expect(reservaRepository.existeSolapadaDeUsuario).toHaveBeenCalledWith(
      USUARIO_ID,
      datosReserva.fecha,
      datosReserva.horaInicio,
      datosReserva.horaFin
    );
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('US-12: permite reservas del mismo usuario en canchas/fechas/horas distintas sin solape', async () => {
    reservaRepository.existeSolapadaDeUsuario.mockResolvedValue(false);
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.id).toBe('reserva-1');
  });

  it('US-12: rechaza con 409 y mensaje claro si el usuario ya alcanzó el máximo de reservas activas', async () => {
    reservaRepository.contarActivasPorUsuario.mockResolvedValue(5);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/5 reservas activas/i),
    });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('US-12: permite crear la reserva justo por debajo del límite máximo', async () => {
    reservaRepository.contarActivasPorUsuario.mockResolvedValue(4);
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.id).toBe('reserva-1');
  });

  it('DEF-03: rechaza con 400 FUERA_DE_HORARIO una reserva fuera del horario de la cancha, sin guardarla', async () => {
    await expect(
      reservaService.crearReserva({ ...datosReserva, horaInicio: '03:00', horaFin: '04:00' })
    ).rejects.toMatchObject({ statusCode: 400, codigo: 'FUERA_DE_HORARIO' });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('DEF-03: rechaza un día en que la cancha no tiene horario', async () => {
    horarioRepository.listarPorCancha.mockResolvedValue([]);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({ codigo: 'FUERA_DE_HORARIO' });
  });

  it('DEF-04: rechaza con 400 las franjas que no son de exactamente 1 hora (evita solapes)', async () => {
    for (const [horaInicio, horaFin] of [['10:00', '12:00'], ['10:30', '11:30'], ['10:00', '10:30']]) {
      await expect(
        reservaService.crearReserva({ ...datosReserva, horaInicio, horaFin })
      ).rejects.toMatchObject({ statusCode: 400, codigo: expect.stringMatching(/BLOQUE_INVALIDO|FUERA_DE_HORARIO/) });
    }
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('DEF-04: la restricción de exclusión de Postgres (23P01, franjas solapadas) también se traduce en un 409 amigable', async () => {
    const errorPostgres = new Error('conflicting key value violates exclusion constraint');
    errorPostgres.code = '23P01';
    reservaRepository.crear.mockRejectedValue(errorPostgres);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({
      statusCode: 409,
      message: 'El horario ya no está disponible',
    });
  });

  it('convierte la violación de índice único de Postgres (23505) en un 409 amigable', async () => {
    const errorPostgres = new Error('duplicate key value violates unique constraint');
    errorPostgres.code = '23505';
    reservaRepository.crear.mockRejectedValue(errorPostgres);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/no está disponible/i),
    });
  });

  it('propaga cualquier otro error sin traducirlo a 409', async () => {
    const errorInesperado = new Error('conexión perdida');
    reservaRepository.crear.mockRejectedValue(errorInesperado);

    await expect(reservaService.crearReserva(datosReserva)).rejects.toBe(errorInesperado);
  });
});

describe('reservaService.cancelarReserva (US-14)', () => {
  const pagoRepository = require('../src/repositories/pagoRepository');
  const pagoService = require('../src/services/pagoService');

  // Reserva futura lejana (siempre hay más de 2 horas) o que empieza dentro de un lapso dado.
  const reservaFutura = (extra = {}) => ({
    id: 'reserva-1',
    codigo: 'CY-AAAA1111',
    canchaId: CANCHA_ID,
    usuarioId: USUARIO_ID,
    estado: 'confirmada',
    fecha: FECHA_FUTURA,
    horaInicio: '10:00:00',
    horaFin: '11:00:00',
    ...extra,
  });

  // Hora de Colombia (UTC-5) a la que comienza una reserva que empieza dentro de `minutos` minutos.
  function reservaQueEmpiezaEn(minutos) {
    const inicio = new Date(Date.now() + minutos * 60000 - 5 * 3600 * 1000);
    const iso = inicio.toISOString();
    return reservaFutura({ fecha: iso.slice(0, 10), horaInicio: `${iso.slice(11, 16)}:00` });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    pagoRepository.obtenerPorReserva.mockResolvedValue(null);
    usuarioRepository.buscarPorId.mockResolvedValue({ id: USUARIO_ID, nombre: 'Ana', correo: 'ana@test.local' });
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' });
    emailService.enviarCorreoCancelacionReserva.mockResolvedValue({ simulado: true });
  });

  it('cancela una reserva confirmada del dueño, libera la franja y envía el correo', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
    reservaRepository.cancelar.mockResolvedValue(reservaFutura({ estado: 'cancelada' }));

    const { reserva, reembolso } = await reservaService.cancelarReserva('reserva-1', USUARIO_ID);
    await esperarTareasPendientes();

    expect(reserva.estado).toBe('cancelada');
    expect(reembolso).toBeNull();
    expect(reservaRepository.cancelar).toHaveBeenCalledWith('reserva-1', USUARIO_ID, undefined);
    expect(retencionService.notificarFranjaLiberada).toHaveBeenCalledWith(USUARIO_ID, expect.objectContaining({ id: 'reserva-1' }));
    expect(emailService.enviarCorreoCancelacionReserva).toHaveBeenCalledWith(
      expect.objectContaining({ para: 'ana@test.local', reembolso: null, reserva: expect.objectContaining({ cancha: expect.objectContaining({ nombre: 'Cancha 1' }) }) })
    );
  });

  it('el fallo del correo no impide la cancelación', async () => {
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
    reservaRepository.cancelar.mockResolvedValue(reservaFutura({ estado: 'cancelada' }));
    emailService.enviarCorreoCancelacionReserva.mockRejectedValue(new Error('SMTP caído'));

    const { reserva } = await reservaService.cancelarReserva('reserva-1', USUARIO_ID);
    await esperarTareasPendientes();

    expect(reserva.estado).toBe('cancelada');
    silencio.mockRestore();
  });

  it('bloquea con 409 si faltan menos de 2 horas, sin tocar la reserva', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaQueEmpiezaEn(90));

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'CANCELACION_FUERA_DE_PLAZO',
      message: expect.stringContaining('2 horas'),
    });
    expect(reservaRepository.cancelar).not.toHaveBeenCalled();
  });

  it('permite cancelar cuando faltan más de 2 horas', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaQueEmpiezaEn(125));
    reservaRepository.cancelar.mockResolvedValue(reservaFutura({ estado: 'cancelada' }));

    const { reserva } = await reservaService.cancelarReserva('reserva-1', USUARIO_ID);
    expect(reserva.estado).toBe('cancelada');
  });

  it('bloquea la cancelación de una reserva que ya empezó', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaQueEmpiezaEn(-30));

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({ statusCode: 409, codigo: 'CANCELACION_FUERA_DE_PLAZO' });
  });

  it('lanza 404 si la reserva no existe', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(null);

    await expect(reservaService.cancelarReserva('reserva-x', USUARIO_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lanza 403 si la reserva es de otro usuario y no la modifica', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura({ usuarioId: 'otro-usuario' }));

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({ statusCode: 403 });
    expect(reservaRepository.cancelar).not.toHaveBeenCalled();
  });

  it('lanza 409 si la reserva ya estaba cancelada', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura({ estado: 'cancelada' }));

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanza 409 si otra petición la canceló justo antes', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
    reservaRepository.cancelar.mockResolvedValue(null);

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('con un pago aprobado (US-28)', () => {
    const pago = { id: 'pago-1', reservaId: 'reserva-1', estado: 'aprobado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242', referencia: 'pay_sim_abc' };

    it('reembolsa el pago dentro de la cancelación y lo informa', async () => {
      const reembolsarSpy = jest.spyOn(pagoService, 'reembolsar').mockResolvedValue({ ...pago, estado: 'reembolsado' });
      pagoRepository.obtenerPorReserva.mockResolvedValue(pago);
      reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
      // El repositorio ejecuta el paso de la transacción: aquí se simula esa llamada.
      reservaRepository.cancelar.mockImplementation(async (id, usuarioId, enTransaccion) => {
        await enTransaccion({ query: jest.fn() }, reservaFutura({ estado: 'cancelada' }));
        return reservaFutura({ estado: 'cancelada' });
      });

      const { reembolso } = await reservaService.cancelarReserva('reserva-1', USUARIO_ID);
      await esperarTareasPendientes();

      expect(reembolsarSpy).toHaveBeenCalledWith(expect.anything(), pago);
      expect(reembolso).toEqual({ estado: 'reembolsado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' });
      expect(emailService.enviarCorreoCancelacionReserva).toHaveBeenCalledWith(expect.objectContaining({ reembolso }));
      reembolsarSpy.mockRestore();
    });

    it('si el reembolso falla, la reserva no se cancela', async () => {
      const ErrorDeAplicacion = require('../src/utils/ErrorDeAplicacion');
      const reembolsarSpy = jest.spyOn(pagoService, 'reembolsar').mockRejectedValue(new ErrorDeAplicacion('No fue posible procesar el reembolso', 502, 'REEMBOLSO_FALLIDO'));
      pagoRepository.obtenerPorReserva.mockResolvedValue(pago);
      reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
      reservaRepository.cancelar.mockImplementation(async (id, usuarioId, enTransaccion) => {
        await enTransaccion({ query: jest.fn() }, reservaFutura({ estado: 'cancelada' }));
      });

      await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({ statusCode: 502, codigo: 'REEMBOLSO_FALLIDO' });
      expect(retencionService.notificarFranjaLiberada).not.toHaveBeenCalled();
      reembolsarSpy.mockRestore();
    });

    it('un pago ya reembolsado no se vuelve a reembolsar', async () => {
      pagoRepository.obtenerPorReserva.mockResolvedValue({ ...pago, estado: 'reembolsado' });
      reservaRepository.obtenerPorId.mockResolvedValue(reservaFutura());
      reservaRepository.cancelar.mockResolvedValue(reservaFutura({ estado: 'cancelada' }));

      await reservaService.cancelarReserva('reserva-1', USUARIO_ID);

      expect(reservaRepository.cancelar).toHaveBeenCalledWith('reserva-1', USUARIO_ID, undefined);
    });
  });
});

describe('reservaService.crearReserva con pago con tarjeta (US-28)', () => {
  const metodoPagoRepository = require('../src/repositories/metodoPagoRepository');
  const pagoService = require('../src/services/pagoService');
  const ErrorDeAplicacion = require('../src/utils/ErrorDeAplicacion');

  const METODO = { id: 'metodo-1', usuarioId: USUARIO_ID, token: 'tok_sim_x_a', marca: 'Visa', ultimos4: '4242', vencimientoMes: 12, vencimientoAnio: 2099 };
  const pagoRegistrado = { id: 'pago-1', estado: 'aprobado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242', referencia: 'pay_sim_abc' };
  const datosReserva = { canchaId: CANCHA_ID, usuarioId: USUARIO_ID, fecha: FECHA_FUTURA, horaInicio: '08:00', horaFin: '09:00' };
  const datosConPago = { ...datosReserva, metodoPagoId: 'metodo-1' };

  beforeEach(() => {
    jest.resetAllMocks();
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1', costoHora: 60000 });
    usuarioRepository.buscarPorId.mockResolvedValue({ id: USUARIO_ID, nombre: 'Ana', correo: 'ana@test.local' });
    emailService.enviarCorreoConfirmacionReserva.mockResolvedValue({ simulado: true });
    retencionService.verificarDisponibleParaReservar.mockResolvedValue(undefined);
    retencionService.convertirEnReserva.mockResolvedValue(undefined);
    horarioRepository.listarPorCancha.mockResolvedValue(HORARIO_DIARIO);
    reservaRepository.existeSolapadaDeUsuario.mockResolvedValue(false);
    reservaRepository.contarActivasPorUsuario.mockResolvedValue(0);
    metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(METODO);
  });

  it('sin método de pago no cobra nada (el pago sigue siendo opcional)', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.pago).toBeNull();
    expect(metodoPagoRepository.obtenerDeUsuario).not.toHaveBeenCalled();
  });

  it('cobra el valor de la hora con la tarjeta elegida y devuelve el resumen del pago', async () => {
    const cobrarSpy = jest.spyOn(pagoService, 'cobrarReserva').mockResolvedValue({ pago: pagoRegistrado, deshacer: jest.fn() });
    reservaRepository.crear.mockImplementation(async (datos, enTransaccion) => {
      const nueva = { id: 'reserva-1', codigo: 'CY-RESERVA1', ...datos, estado: 'confirmada' };
      await enTransaccion({ query: jest.fn() }, nueva);
      return nueva;
    });

    const reserva = await reservaService.crearReserva(datosConPago);

    expect(metodoPagoRepository.obtenerDeUsuario).toHaveBeenCalledWith('metodo-1', USUARIO_ID);
    expect(cobrarSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ monto: 60000, metodoPago: METODO }));
    expect(reserva.pago).toEqual({ estado: 'aprobado', monto: 60000, moneda: 'COP', marca: 'Visa', ultimos4: '4242' });
    cobrarSpy.mockRestore();
  });

  it('si el pago es rechazado la reserva no se confirma ni se notifica', async () => {
    const cobrarSpy = jest
      .spyOn(pagoService, 'cobrarReserva')
      .mockRejectedValue(new ErrorDeAplicacion('El pago fue rechazado: Fondos insuficientes.', 402, 'PAGO_RECHAZADO'));
    reservaRepository.crear.mockImplementation(async (datos, enTransaccion) => {
      await enTransaccion({ query: jest.fn() }, { id: 'reserva-1', ...datos });
    });

    await expect(reservaService.crearReserva(datosConPago)).rejects.toMatchObject({ statusCode: 402, codigo: 'PAGO_RECHAZADO' });

    expect(retencionService.convertirEnReserva).not.toHaveBeenCalled();
    expect(emailService.enviarCorreoConfirmacionReserva).not.toHaveBeenCalled();
    cobrarSpy.mockRestore();
  });

  it('no deja pagar con la tarjeta de otro usuario (404)', async () => {
    metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(null);

    await expect(reservaService.crearReserva(datosConPago)).rejects.toMatchObject({ statusCode: 404 });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('rechaza con 400 una tarjeta vencida sin intentar el cobro', async () => {
    metodoPagoRepository.obtenerDeUsuario.mockResolvedValue({ ...METODO, vencimientoMes: 1, vencimientoAnio: 2020 });

    await expect(reservaService.crearReserva(datosConPago)).rejects.toMatchObject({ statusCode: 400, codigo: 'TARJETA_VENCIDA' });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });
});
