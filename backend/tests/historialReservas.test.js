jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/reservaRepository');

const reservaRepository = require('../src/repositories/reservaRepository');
const reservaService = require('../src/services/reservaService');

const USUARIO_ID = 'usuario-1';

describe('reservaService.listarMisReservas (US-13)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    reservaRepository.listarPorUsuario.mockResolvedValue({ reservas: [], total: 0 });
  });

  it('consulta solo las reservas del usuario recibido, con valores por defecto', async () => {
    await reservaService.listarMisReservas({ usuarioId: USUARIO_ID });

    expect(reservaRepository.listarPorUsuario).toHaveBeenCalledWith({
      usuarioId: USUARIO_ID,
      periodo: 'proximas',
      estado: null,
      limite: 10,
      offset: 0,
    });
  });

  it('calcula el desplazamiento según la página solicitada', async () => {
    await reservaService.listarMisReservas({ usuarioId: USUARIO_ID, periodo: 'pasadas', pagina: 3, limite: 10 });

    expect(reservaRepository.listarPorUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ periodo: 'pasadas', limite: 10, offset: 20 })
    );
  });

  it('transmite el filtro de estado al repositorio', async () => {
    await reservaService.listarMisReservas({ usuarioId: USUARIO_ID, estado: 'cancelada' });

    expect(reservaRepository.listarPorUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'cancelada' })
    );
  });

  it('limita el tamaño de página a 50 aunque se pida más', async () => {
    await reservaService.listarMisReservas({ usuarioId: USUARIO_ID, limite: 500 });

    expect(reservaRepository.listarPorUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ limite: 50 })
    );
  });

  it('devuelve la paginación con el total de páginas calculado', async () => {
    reservaRepository.listarPorUsuario.mockResolvedValue({
      reservas: [{ id: 'reserva-1' }],
      total: 23,
    });

    const resultado = await reservaService.listarMisReservas({ usuarioId: USUARIO_ID, pagina: 2 });

    expect(resultado.reservas).toHaveLength(1);
    expect(resultado.paginacion).toEqual({ pagina: 2, limite: 10, total: 23, totalPaginas: 3 });
  });

  it('con cero reservas devuelve una sola página vacía', async () => {
    const resultado = await reservaService.listarMisReservas({ usuarioId: USUARIO_ID });

    expect(resultado.reservas).toEqual([]);
    expect(resultado.paginacion).toEqual({ pagina: 1, limite: 10, total: 0, totalPaginas: 1 });
  });
});