jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/usuarioRepository', () => ({ buscarPorId: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ enviarCorreoConfirmacionReserva: jest.fn() }));
jest.mock('../src/repositories/sesionReservaRepository');
jest.mock('../src/services/retencionService', () => ({
  verificarDisponibleParaReservar: jest.fn(),
  convertirEnReserva: jest.fn(),
  notificarFranjaLiberada: jest.fn(),
}));

const canchaRepository = require('../src/repositories/canchaRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const emailService = require('../src/services/emailService');
const temporizadorService = require('../src/services/temporizadorReservaService');
const retencionService = require('../src/services/retencionService');
const reservaService = require('../src/services/reservaService');

const esperarTareasPendientes = () => new Promise((resolve) => setImmediate(resolve));

const CANCHA_ID = 'cancha-1';
const USUARIO_ID = 'usuario-1';

describe('reservaService.crearReserva', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1', direccion: 'Calle 1' });
    usuarioRepository.buscarPorId.mockResolvedValue({ id: USUARIO_ID, nombre: 'Ana', correo: 'ana@test.local' });
    emailService.enviarCorreoConfirmacionReserva.mockResolvedValue({ simulado: true });
    retencionService.verificarDisponibleParaReservar.mockResolvedValue(undefined);
    retencionService.convertirEnReserva.mockResolvedValue(undefined);
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
    fecha: '2026-10-01',
    horaInicio: '08:00',
    horaFin: '09:00',
  };

  it('crea la reserva cuando la cancha existe y la franja está libre', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'confirmada' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.id).toBe('reserva-1');
    expect(reservaRepository.crear).toHaveBeenCalledWith(datosReserva);
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

describe('reservaService.cancelarReserva', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('cancela una reserva confirmada del dueño y libera la franja', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({
      id: 'reserva-1',
      usuarioId: USUARIO_ID,
      estado: 'confirmada',
    });
    reservaRepository.cancelar.mockResolvedValue({
      id: 'reserva-1',
      usuarioId: USUARIO_ID,
      estado: 'cancelada',
    });

    const reserva = await reservaService.cancelarReserva('reserva-1', USUARIO_ID);

    expect(reserva.estado).toBe('cancelada');
    expect(reservaRepository.cancelar).toHaveBeenCalledWith('reserva-1', USUARIO_ID);
  });

  it('lanza 404 si la reserva no existe', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue(null);

    await expect(reservaService.cancelarReserva('reserva-x', USUARIO_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lanza 403 si la reserva es de otro usuario', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({
      id: 'reserva-1',
      usuarioId: 'otro-usuario',
      estado: 'confirmada',
    });

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('lanza 409 si la reserva ya estaba cancelada', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({
      id: 'reserva-1',
      usuarioId: USUARIO_ID,
      estado: 'cancelada',
    });

    await expect(reservaService.cancelarReserva('reserva-1', USUARIO_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
