jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/reservaRepository');

const canchaRepository = require('../src/repositories/canchaRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const reservaService = require('../src/services/reservaService');

const CANCHA_ID = 'cancha-1';
const USUARIO_ID = 'usuario-1';

describe('reservaService.crearReserva', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cancha 1' });
  });

  const datosReserva = {
    canchaId: CANCHA_ID,
    usuarioId: USUARIO_ID,
    fecha: '2026-10-01',
    horaInicio: '08:00',
    horaFin: '09:00',
  };

  it('crea la reserva cuando la cancha existe y la franja está libre', async () => {
    reservaRepository.crear.mockResolvedValue({ id: 'reserva-1', ...datosReserva, estado: 'activa' });

    const reserva = await reservaService.crearReserva(datosReserva);

    expect(reserva.id).toBe('reserva-1');
    expect(reservaRepository.crear).toHaveBeenCalledWith(datosReserva);
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

  it('cancela una reserva activa del dueño y libera la franja', async () => {
    reservaRepository.obtenerPorId.mockResolvedValue({
      id: 'reserva-1',
      usuarioId: USUARIO_ID,
      estado: 'activa',
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
      estado: 'activa',
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
