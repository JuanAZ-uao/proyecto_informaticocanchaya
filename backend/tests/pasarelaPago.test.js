// US-28: pasarela de pago simulada y su selector. Sin red ni base de datos.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/prueba';

const simulada = require('../src/services/pasarelas/simulada');

const tarjeta = (numero) => ({ numero, titular: 'Ana', vencimientoMes: 12, vencimientoAnio: 2030, cvv: '123' });

describe('pasarela simulada', () => {
  it('tokeniza una tarjeta: el token no contiene el número y devuelve marca y últimos 4', async () => {
    const resultado = await simulada.tokenizarTarjeta(tarjeta('4242424242424242'));

    expect(resultado).toEqual({ token: expect.stringMatching(/^tok_sim_[0-9a-f]{24}_a$/), marca: 'Visa', ultimos4: '4242' });
    expect(resultado.token).not.toContain('4242424242424242');
  });

  it('cada tokenización genera un token distinto', async () => {
    const [a, b] = await Promise.all([simulada.tokenizarTarjeta(tarjeta('4242424242424242')), simulada.tokenizarTarjeta(tarjeta('4242424242424242'))]);
    expect(a.token).not.toBe(b.token);
  });

  it('cobra con una tarjeta aprobada y devuelve una referencia', async () => {
    const { token } = await simulada.tokenizarTarjeta(tarjeta('4242424242424242'));

    expect(await simulada.cobrar({ token, monto: 60000 })).toEqual({ aprobado: true, referencia: expect.stringMatching(/^pay_sim_/) });
  });

  it('rechaza la tarjeta ...0002 y simula fondos insuficientes con la ...9995', async () => {
    const rechazada = await simulada.tokenizarTarjeta(tarjeta('4000000000000002'));
    const sinFondos = await simulada.tokenizarTarjeta(tarjeta('4000000000009995'));

    expect(await simulada.cobrar({ token: rechazada.token, monto: 60000 })).toEqual({ aprobado: false, motivo: 'La tarjeta fue rechazada por el banco emisor' });
    expect(await simulada.cobrar({ token: sinFondos.token, monto: 60000 })).toEqual({ aprobado: false, motivo: 'Fondos insuficientes' });
  });

  it('rechaza un token que no es de la pasarela o un monto inválido', async () => {
    const { token } = await simulada.tokenizarTarjeta(tarjeta('4242424242424242'));

    expect((await simulada.cobrar({ token: 'tok_de_otra_pasarela', monto: 1000 })).aprobado).toBe(false);
    expect((await simulada.cobrar({ token: undefined, monto: 1000 })).aprobado).toBe(false);
    expect(await simulada.cobrar({ token, monto: 0 })).toEqual({ aprobado: false, motivo: 'El monto a cobrar no es válido' });
  });

  it('reembolsa un cobro conocido y falla con una referencia desconocida', async () => {
    expect(await simulada.reembolsar({ referencia: 'pay_sim_abc123' })).toEqual({ referencia: expect.stringMatching(/^ref_sim_/) });
    await expect(simulada.reembolsar({ referencia: 'otra' })).rejects.toThrow('Referencia de pago desconocida');
    await expect(simulada.reembolsar({})).rejects.toThrow();
  });

  it('elimina un token válido y no reconoce uno ajeno', async () => {
    const { token } = await simulada.tokenizarTarjeta(tarjeta('4242424242424242'));

    expect(await simulada.eliminarToken(token)).toEqual({ eliminado: true });
    expect(await simulada.eliminarToken('tok_ajeno')).toEqual({ eliminado: false });
  });
});

describe('selector de pasarela', () => {
  afterEach(() => jest.resetModules());

  it('usa la pasarela simulada por defecto', async () => {
    const pasarela = require('../src/services/pasarelaPago');
    const resultado = await pasarela.tokenizarTarjeta(tarjeta('4242424242424242'));

    expect(resultado.marca).toBe('Visa');
    expect((await pasarela.cobrar({ token: resultado.token, monto: 1000 })).aprobado).toBe(true);
    expect(await pasarela.reembolsar({ referencia: 'pay_sim_x' })).toEqual({ referencia: expect.any(String) });
    expect(await pasarela.eliminarToken(resultado.token)).toEqual({ eliminado: true });
  });

  it('falla con un mensaje claro si la pasarela configurada no existe', async () => {
    jest.doMock('../src/config/env', () => ({ pasarelaPago: 'inexistente' }));
    const pasarela = require('../src/services/pasarelaPago');

    expect(() => pasarela.cobrar({ token: 'x', monto: 1 })).toThrow('Pasarela de pago desconocida: "inexistente" (disponibles: simulada)');
    jest.dontMock('../src/config/env');
  });
});
