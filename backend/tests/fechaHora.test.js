const { aMomentoColombia, esMomentoPasado, minutosHastaInicio } = require('../src/utils/fechaHora');

describe('fechaHora', () => {
  it('interpreta la fecha y hora en hora de Colombia (UTC-5)', () => {
    expect(aMomentoColombia('2026-09-29', '10:00').toISOString()).toBe('2026-09-29T15:00:00.000Z');
  });

  it('considera pasado un bloque de hoy cuya hora de inicio ya pasó', () => {
    // 29/09/2026 22:05 en Colombia
    const ahora = Date.parse('2026-09-30T03:05:00Z');
    expect(esMomentoPasado('2026-09-29', '10:00', ahora)).toBe(true);
    expect(esMomentoPasado('2026-09-29', '22:00', ahora)).toBe(true);
  });

  it('no considera pasado un bloque posterior a la hora actual', () => {
    // 29/09/2026 09:30 en Colombia
    const ahora = Date.parse('2026-09-29T14:30:00Z');
    expect(esMomentoPasado('2026-09-29', '10:00', ahora)).toBe(false);
    expect(esMomentoPasado('2026-09-30', '06:00', ahora)).toBe(false);
  });

  it('trata como pasado un valor de fecha inválido', () => {
    expect(esMomentoPasado('fecha-invalida', '10:00')).toBe(true);
  });

  describe('minutosHastaInicio (US-14)', () => {
    // 29/09/2026 08:00 en Colombia
    const ahora = Date.parse('2026-09-29T13:00:00Z');

    it('cuenta los minutos que faltan para el inicio', () => {
      expect(minutosHastaInicio('2026-09-29', '10:00', ahora)).toBe(120);
      expect(minutosHastaInicio('2026-09-29', '09:30', ahora)).toBe(90);
      expect(minutosHastaInicio('2026-09-30', '08:00', ahora)).toBe(1440);
    });

    it('es negativo si la reserva ya empezó y NaN con una fecha inválida', () => {
      expect(minutosHastaInicio('2026-09-29', '07:30', ahora)).toBe(-30);
      expect(Number.isNaN(minutosHastaInicio('fecha-invalida', '10:00', ahora))).toBe(true);
    });

    it('usa la hora actual si no se la pasa', () => {
      expect(minutosHastaInicio('2099-01-01', '10:00')).toBeGreaterThan(0);
    });
  });
});
