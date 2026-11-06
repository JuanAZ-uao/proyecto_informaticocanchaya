// US-28 / US-14: cobro y reembolso de reservas. La pasarela y el repositorio están simulados.
jest.mock('../src/repositories/pagoRepository');
jest.mock('../src/services/pasarelaPago', () => ({ cobrar: jest.fn(), reembolsar: jest.fn() }));

const pagoRepository = require('../src/repositories/pagoRepository');
const pasarela = require('../src/services/pasarelaPago');
const pagoService = require('../src/services/pagoService');

const CLIENTE = { query: jest.fn() };
const RESERVA = { id: 'reserva-1', codigo: 'CY-AAAA1111' };
const METODO = { id: 'metodo-1', usuarioId: 'usuario-1', token: 'tok_sim_x_a', marca: 'Visa', ultimos4: '4242' };

describe('pagoService.cobrarReserva', () => {
  let silencio;

  beforeEach(() => {
    jest.resetAllMocks();
    silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => silencio.mockRestore());

  it('cobra con el token, registra el pago en la misma transacción y entrega cómo deshacerlo', async () => {
    pasarela.cobrar.mockResolvedValue({ aprobado: true, referencia: 'pay_sim_1' });
    pagoRepository.registrar.mockResolvedValue({ id: 'pago-1', estado: 'aprobado' });

    const { pago, deshacer } = await pagoService.cobrarReserva(CLIENTE, { reserva: RESERVA, metodoPago: METODO, monto: 60000 });

    expect(pasarela.cobrar).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok_sim_x_a', monto: 60000, moneda: 'COP', referenciaExterna: 'reserva-1' }));
    expect(pagoRepository.registrar).toHaveBeenCalledWith(
      CLIENTE,
      expect.objectContaining({ reservaId: 'reserva-1', usuarioId: 'usuario-1', metodoPagoId: 'metodo-1', marca: 'Visa', ultimos4: '4242', monto: 60000, referencia: 'pay_sim_1' })
    );
    expect(pago.id).toBe('pago-1');

    pasarela.reembolsar.mockResolvedValue({});
    await deshacer();
    expect(pasarela.reembolsar).toHaveBeenCalledWith({ referencia: 'pay_sim_1' });
  });

  it('si el pago es rechazado lanza 402 con el motivo y no registra nada', async () => {
    pasarela.cobrar.mockResolvedValue({ aprobado: false, motivo: 'Fondos insuficientes' });

    await expect(pagoService.cobrarReserva(CLIENTE, { reserva: RESERVA, metodoPago: METODO, monto: 60000 })).rejects.toMatchObject({
      statusCode: 402,
      codigo: 'PAGO_RECHAZADO',
      message: expect.stringContaining('Fondos insuficientes'),
    });
    expect(pagoRepository.registrar).not.toHaveBeenCalled();
  });

  it('si la pasarela no responde lanza 502', async () => {
    pasarela.cobrar.mockRejectedValue(new Error('timeout'));

    await expect(pagoService.cobrarReserva(CLIENTE, { reserva: RESERVA, metodoPago: METODO, monto: 60000 })).rejects.toMatchObject({
      statusCode: 502,
      codigo: 'PASARELA_NO_DISPONIBLE',
    });
  });

  it('si se cobró pero no se pudo registrar, devuelve el dinero y propaga el error', async () => {
    const errorBase = new Error('la base se cayó');
    pasarela.cobrar.mockResolvedValue({ aprobado: true, referencia: 'pay_sim_2' });
    pagoRepository.registrar.mockRejectedValue(errorBase);
    pasarela.reembolsar.mockResolvedValue({});

    await expect(pagoService.cobrarReserva(CLIENTE, { reserva: RESERVA, metodoPago: METODO, monto: 60000 })).rejects.toBe(errorBase);
    expect(pasarela.reembolsar).toHaveBeenCalledWith({ referencia: 'pay_sim_2' });
  });

  it('si además falla la devolución, igual propaga el error original', async () => {
    const errorBase = new Error('la base se cayó');
    pasarela.cobrar.mockResolvedValue({ aprobado: true, referencia: 'pay_sim_3' });
    pagoRepository.registrar.mockRejectedValue(errorBase);
    pasarela.reembolsar.mockRejectedValue(new Error('pasarela caída'));

    await expect(pagoService.cobrarReserva(CLIENTE, { reserva: RESERVA, metodoPago: METODO, monto: 60000 })).rejects.toBe(errorBase);
  });
});

describe('pagoService.reembolsar', () => {
  beforeEach(() => jest.resetAllMocks());

  it('reembolsa en la pasarela y marca el pago como reembolsado', async () => {
    pasarela.reembolsar.mockResolvedValue({ referencia: 'ref_sim_1' });
    pagoRepository.marcarReembolsado.mockResolvedValue({ id: 'pago-1', estado: 'reembolsado' });

    const resultado = await pagoService.reembolsar(CLIENTE, { id: 'pago-1', referencia: 'pay_sim_1' });

    expect(pasarela.reembolsar).toHaveBeenCalledWith({ referencia: 'pay_sim_1' });
    expect(pagoRepository.marcarReembolsado).toHaveBeenCalledWith(CLIENTE, 'pago-1', 'ref_sim_1');
    expect(resultado.estado).toBe('reembolsado');
  });

  it('si la pasarela falla lanza 502 y no marca nada', async () => {
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    pasarela.reembolsar.mockRejectedValue(new Error('timeout'));

    await expect(pagoService.reembolsar(CLIENTE, { id: 'pago-1', referencia: 'pay_sim_1' })).rejects.toMatchObject({ statusCode: 502, codigo: 'REEMBOLSO_FALLIDO' });
    expect(pagoRepository.marcarReembolsado).not.toHaveBeenCalled();
    silencio.mockRestore();
  });
});
