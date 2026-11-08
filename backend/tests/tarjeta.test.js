// US-28: validación de tarjetas (Luhn, marca, vencimiento y CVV). Funciones puras, sin base de datos.
const { normalizarNumero, pasaLuhn, detectarMarca, estaVencida, validarTarjeta } = require('../src/utils/tarjeta');

// 15 de junio de 2026, 12:00 en Colombia
const AHORA = Date.parse('2026-06-15T17:00:00Z');

const valida = (extra = {}) => ({ numero: '4242 4242 4242 4242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: 2030, cvv: '123', ...extra });
const camposConError = (tarjeta) => validarTarjeta(tarjeta, AHORA).errores.map((e) => e.campo);

describe('normalizarNumero y pasaLuhn', () => {
  it('quita espacios y guiones', () => {
    expect(normalizarNumero('4242 4242-4242 4242')).toBe('4242424242424242');
    expect(normalizarNumero(undefined)).toBe('');
  });

  it.each(['4242424242424242', '5555555555554444', '378282246310005', '6011111111111117'])('acepta la tarjeta de prueba %s', (numero) => {
    expect(pasaLuhn(numero)).toBe(true);
  });

  it.each(['4242424242424241', '1234567812345678', '4242abcd42424242', ''])('rechaza %s', (numero) => {
    expect(pasaLuhn(numero)).toBe(false);
  });
});

describe('detectarMarca', () => {
  it.each([
    ['4242424242424242', 'Visa'],
    ['5555555555554444', 'Mastercard'],
    ['2223003122003222', 'Mastercard'],
    ['378282246310005', 'American Express'],
    ['30569309025904', 'Diners Club'],
    ['6011111111111117', 'Discover'],
  ])('%s es %s', (numero, marca) => {
    expect(detectarMarca(numero).marca).toBe(marca);
  });

  it('devuelve null para una marca desconocida', () => {
    expect(detectarMarca('9999999999999995')).toBeNull();
  });
});

describe('estaVencida', () => {
  it('la tarjeta vale hasta el último día de su mes de vencimiento', () => {
    expect(estaVencida(6, 2026, AHORA)).toBe(false);
    expect(estaVencida(5, 2026, AHORA)).toBe(true);
    expect(estaVencida(12, 2025, AHORA)).toBe(true);
    expect(estaVencida(1, 2027, AHORA)).toBe(false);
  });

  it('usa la hora de Colombia: a las 02:00 UTC del 1 de julio aún es junio', () => {
    expect(estaVencida(6, 2026, Date.parse('2026-07-01T02:00:00Z'))).toBe(false);
    expect(estaVencida(6, 2026, Date.parse('2026-07-01T06:00:00Z'))).toBe(true);
  });

  it('usa la fecha actual cuando no se le pasa una', () => {
    expect(estaVencida(1, 2000)).toBe(true);
  });
});

describe('validarTarjeta', () => {
  it('acepta una tarjeta válida y devuelve solo marca, últimos 4 y datos normalizados', () => {
    const { errores, datos } = validarTarjeta(valida(), AHORA);

    expect(errores).toEqual([]);
    expect(datos).toEqual({
      numero: '4242424242424242',
      marca: 'Visa',
      ultimos4: '4242',
      titular: 'Ana Pérez',
      vencimientoMes: 12,
      vencimientoAnio: 2030,
    });
    expect(datos).not.toHaveProperty('cvv');
  });

  it('acepta el año de 2 dígitos como 20AA', () => {
    expect(validarTarjeta(valida({ vencimientoAnio: 30 }), AHORA).datos.vencimientoAnio).toBe(2030);
  });

  it('rechaza un número que no cumple Luhn', () => {
    expect(camposConError(valida({ numero: '4242424242424241' }))).toEqual(['numero']);
  });

  it('rechaza un número de una marca desconocida o con letras', () => {
    expect(camposConError(valida({ numero: '9999999999999995' }))).toContain('numero');
    expect(camposConError(valida({ numero: '4242 4242 4242 42ab' }))).toContain('numero');
  });

  it('rechaza una tarjeta vencida', () => {
    const { errores } = validarTarjeta(valida({ vencimientoMes: 5, vencimientoAnio: 2026 }), AHORA);
    expect(errores).toEqual([{ campo: 'vencimientoAnio', mensaje: 'La tarjeta está vencida' }]);
  });

  it.each([[0, 2030], [13, 2030], ['abc', 2030]])('rechaza el mes %s', (mes, anio) => {
    expect(camposConError(valida({ vencimientoMes: mes, vencimientoAnio: anio }))).toEqual(['vencimientoMes']);
  });

  it('rechaza un año imposible o demasiado lejano', () => {
    expect(camposConError(valida({ vencimientoAnio: 1999 }))).toEqual(['vencimientoAnio']);
    expect(camposConError(valida({ vencimientoAnio: 2099 }))).toEqual(['vencimientoAnio']);
    expect(camposConError(valida({ vencimientoAnio: 'xx' }))).toEqual(['vencimientoAnio']);
  });

  it.each(['12', '12345', 'abc', '', undefined])('rechaza el CVV %s', (cvv) => {
    expect(camposConError(valida({ cvv }))).toEqual(['cvv']);
  });

  it('American Express exige CVV de 4 dígitos y las demás de 3', () => {
    expect(camposConError(valida({ numero: '378282246310005', cvv: '123' }))).toEqual(['cvv']);
    expect(camposConError(valida({ numero: '378282246310005', cvv: '1234' }))).toEqual([]);
    expect(camposConError(valida({ cvv: '1234' }))).toEqual(['cvv']);
  });

  it('exige el nombre del titular', () => {
    expect(camposConError(valida({ titular: ' ' }))).toEqual(['titular']);
    expect(camposConError(valida({ titular: 'x'.repeat(61) }))).toEqual(['titular']);
  });

  it('informa todos los campos con error a la vez', () => {
    expect(camposConError({ numero: '1', titular: '', vencimientoMes: 0, vencimientoAnio: 1, cvv: '' })).toEqual(
      expect.arrayContaining(['numero', 'titular', 'vencimientoMes', 'cvv'])
    );
  });

  it('los mensajes de error nunca repiten el número, el CVV ni el titular', () => {
    const entrada = valida({ numero: '4242424242424241', cvv: '9', titular: 'NOMBRE-SECRETO-X' });
    const texto = JSON.stringify(validarTarjeta(entrada, AHORA).errores);

    expect(texto).not.toContain('4242424242424241');
    expect(texto).not.toContain('4242');
    expect(texto).not.toContain('NOMBRE-SECRETO-X');
  });
});
