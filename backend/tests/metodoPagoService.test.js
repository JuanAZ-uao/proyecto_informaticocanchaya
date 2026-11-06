// US-28: métodos de pago. Repositorio y pasarela simulados.
jest.mock('../src/repositories/metodoPagoRepository');
jest.mock('../src/services/pasarelaPago', () => ({ tokenizarTarjeta: jest.fn(), eliminarToken: jest.fn() }));

const metodoPagoRepository = require('../src/repositories/metodoPagoRepository');
const pasarela = require('../src/services/pasarelaPago');
const metodoPagoService = require('../src/services/metodoPagoService');

const USUARIO = 'usuario-1';
const tarjeta = (extra = {}) => ({ numero: '4242 4242 4242 4242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: 2099 - 40 + 0, cvv: '123', ...extra });
const ANIO_VALIDO = new Date().getFullYear() + 3;
const valida = (extra = {}) => tarjeta({ vencimientoAnio: ANIO_VALIDO, ...extra });

const fila = (extra = {}) => ({
  id: 'metodo-1',
  usuarioId: USUARIO,
  token: 'tok_sim_abc_a',
  marca: 'Visa',
  ultimos4: '4242',
  titular: 'Ana Pérez',
  vencimientoMes: 12,
  vencimientoAnio: ANIO_VALIDO,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  ...extra,
});

describe('metodoPagoService', () => {
  let silencio;

  beforeEach(() => {
    jest.resetAllMocks();
    silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => silencio.mockRestore());

  describe('listarMetodosDePago', () => {
    it('devuelve las tarjetas enmascaradas, sin token', async () => {
      metodoPagoRepository.listarPorUsuario.mockResolvedValue([fila()]);

      const lista = await metodoPagoService.listarMetodosDePago(USUARIO);

      expect(lista).toEqual([expect.objectContaining({ id: 'metodo-1', marca: 'Visa', ultimos4: '4242', titular: 'Ana Pérez', vencimiento: `12/${String(ANIO_VALIDO).slice(-2)}` })]);
      expect(JSON.stringify(lista)).not.toContain('tok_sim');
      expect(lista[0]).not.toHaveProperty('token');
    });
  });

  describe('agregarMetodoDePago', () => {
    beforeEach(() => {
      metodoPagoRepository.contarPorUsuario.mockResolvedValue(0);
      pasarela.tokenizarTarjeta.mockResolvedValue({ token: 'tok_sim_abc_a', marca: 'Visa', ultimos4: '4242' });
      metodoPagoRepository.crear.mockResolvedValue(fila());
    });

    it('tokeniza en la pasarela y guarda SOLO token, marca, últimos 4, titular y vencimiento', async () => {
      const guardada = await metodoPagoService.agregarMetodoDePago(USUARIO, valida());

      expect(pasarela.tokenizarTarjeta).toHaveBeenCalledWith(expect.objectContaining({ numero: '4242424242424242', cvv: '123' }));

      const guardado = metodoPagoRepository.crear.mock.calls[0][0];
      expect(guardado).toEqual({ usuarioId: USUARIO, token: 'tok_sim_abc_a', marca: 'Visa', ultimos4: '4242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: ANIO_VALIDO });
      expect(JSON.stringify(guardado)).not.toContain('4242424242424242');
      expect(JSON.stringify(guardado)).not.toContain('123');

      expect(guardada).toMatchObject({ marca: 'Visa', ultimos4: '4242' });
      expect(guardada).not.toHaveProperty('token');
    });

    it('rechaza una tarjeta inválida con el error de cada campo y sin llamar a la pasarela', async () => {
      await expect(metodoPagoService.agregarMetodoDePago(USUARIO, valida({ numero: '4242424242424241', cvv: '12' }))).rejects.toMatchObject({
        statusCode: 400,
        codigo: 'TARJETA_INVALIDA',
        errores: expect.arrayContaining([expect.objectContaining({ campo: 'numero' }), expect.objectContaining({ campo: 'cvv' })]),
      });
      expect(pasarela.tokenizarTarjeta).not.toHaveBeenCalled();
      expect(metodoPagoRepository.crear).not.toHaveBeenCalled();
    });

    it('rechaza una tarjeta vencida', async () => {
      await expect(metodoPagoService.agregarMetodoDePago(USUARIO, valida({ vencimientoMes: 1, vencimientoAnio: 2020 }))).rejects.toMatchObject({
        errores: [{ campo: 'vencimientoAnio', mensaje: 'La tarjeta está vencida' }],
      });
    });

    it('limita las tarjetas por usuario (409)', async () => {
      metodoPagoRepository.contarPorUsuario.mockResolvedValue(metodoPagoService.MAXIMO_TARJETAS_POR_USUARIO);

      await expect(metodoPagoService.agregarMetodoDePago(USUARIO, valida())).rejects.toMatchObject({ statusCode: 409, codigo: 'LIMITE_TARJETAS' });
      expect(pasarela.tokenizarTarjeta).not.toHaveBeenCalled();
    });

    it('si la pasarela no responde lanza 502 y no guarda nada', async () => {
      pasarela.tokenizarTarjeta.mockRejectedValue(new Error('timeout'));

      await expect(metodoPagoService.agregarMetodoDePago(USUARIO, valida())).rejects.toMatchObject({ statusCode: 502, codigo: 'PASARELA_NO_DISPONIBLE' });
      expect(metodoPagoRepository.crear).not.toHaveBeenCalled();
    });
  });

  describe('eliminarMetodoDePago', () => {
    it('borra el token en la pasarela y luego la tarjeta', async () => {
      metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(fila());
      pasarela.eliminarToken.mockResolvedValue({ eliminado: true });

      await metodoPagoService.eliminarMetodoDePago(USUARIO, 'metodo-1');

      expect(pasarela.eliminarToken).toHaveBeenCalledWith('tok_sim_abc_a');
      expect(metodoPagoRepository.eliminar).toHaveBeenCalledWith('metodo-1', USUARIO);
    });

    it('lanza 404 si la tarjeta no existe o es de otro usuario', async () => {
      metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(null);

      await expect(metodoPagoService.eliminarMetodoDePago(USUARIO, 'ajena')).rejects.toMatchObject({ statusCode: 404 });
      expect(pasarela.eliminarToken).not.toHaveBeenCalled();
    });

    it('si la pasarela falla, conserva la tarjeta y lanza 502', async () => {
      metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(fila());
      pasarela.eliminarToken.mockRejectedValue(new Error('timeout'));

      await expect(metodoPagoService.eliminarMetodoDePago(USUARIO, 'metodo-1')).rejects.toMatchObject({ statusCode: 502 });
      expect(metodoPagoRepository.eliminar).not.toHaveBeenCalled();
    });
  });

  describe('obtenerParaPagar', () => {
    it('devuelve la tarjeta (con su token) si es del usuario y está vigente', async () => {
      metodoPagoRepository.obtenerDeUsuario.mockResolvedValue(fila());

      expect(await metodoPagoService.obtenerParaPagar(USUARIO, 'metodo-1')).toMatchObject({ token: 'tok_sim_abc_a' });
      expect(metodoPagoRepository.obtenerDeUsuario).toHaveBeenCalledWith('metodo-1', USUARIO);
    });

    it('lanza 404 si no es suya y 400 si está vencida', async () => {
      metodoPagoRepository.obtenerDeUsuario.mockResolvedValueOnce(null);
      await expect(metodoPagoService.obtenerParaPagar(USUARIO, 'ajena')).rejects.toMatchObject({ statusCode: 404 });

      metodoPagoRepository.obtenerDeUsuario.mockResolvedValueOnce(fila({ vencimientoMes: 1, vencimientoAnio: 2020 }));
      await expect(metodoPagoService.obtenerParaPagar(USUARIO, 'metodo-1')).rejects.toMatchObject({ statusCode: 400, codigo: 'TARJETA_VENCIDA' });
    });
  });
});
