import { describe, expect, it } from 'vitest';
import { esBloquePasado, obtenerFechaHoyColombia } from '../src/utils/fechaHora';
import { formatearFechaLarga, formatearHora, formateadorMoneda } from '../src/utils/formato';
import iconoServicio from '../src/utils/iconoServicio';
import extraerMensajeError from '../src/api/extraerMensajeError';

describe('fechaHora', () => {
  it('obtiene la fecha de hoy en hora de Colombia (UTC-5)', () => {
    // 02:00 UTC del 10 es todavía el día 9 en Colombia
    expect(obtenerFechaHoyColombia(Date.parse('2026-10-10T02:00:00Z'))).toBe('2026-10-09');
    expect(obtenerFechaHoyColombia(Date.parse('2026-10-10T15:00:00Z'))).toBe('2026-10-10');
  });

  it('usa la hora actual cuando no se le pasa una', () => {
    expect(obtenerFechaHoyColombia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reconoce un bloque pasado, uno futuro y uno inválido', () => {
    const ahora = Date.parse('2026-10-10T15:00:00Z'); // 10:00 en Colombia
    expect(esBloquePasado('2026-10-10', '09:00', ahora)).toBe(true);
    expect(esBloquePasado('2026-10-10', '10:00', ahora)).toBe(true);
    expect(esBloquePasado('2026-10-10', '11:00', ahora)).toBe(false);
    expect(esBloquePasado('fecha-mala', '11:00', ahora)).toBe(true);
    expect(esBloquePasado('2099-01-01', '11:00')).toBe(false);
  });
});

describe('formato', () => {
  it('da formato de pesos colombianos sin decimales', () => {
    expect(formateadorMoneda.format(50000)).toContain('50.000');
  });

  it('da formato largo a una fecha', () => {
    const texto = formatearFechaLarga('2026-10-01');
    expect(texto).toContain('octubre');
    expect(texto).toContain('2026');
  });

  it('recorta la hora a HH:mm y tolera valores vacíos', () => {
    expect(formatearHora('18:00:00')).toBe('18:00');
    expect(formatearHora(undefined)).toBeUndefined();
  });
});

describe('iconoServicio', () => {
  it.each([
    ['Iluminación LED', 'bombillo'],
    ['Parqueadero', 'carro'],
    ['Vestier y duchas', 'camiseta'],
    ['Café', 'cafe'],
    ['Graderías', 'personas'],
    ['Wi-Fi', 'wifi'],
    ['Hidratación', 'gota'],
    ['Balones', 'balon'],
    ['Zonas verdes', 'hoja'],
    ['Cancha cerrada', 'escudo'],
    ['Grama sintética', 'estrella'],
    ['Algo desconocido', 'check'],
  ])('asigna el ícono de "%s"', (servicio, icono) => {
    expect(iconoServicio(servicio)).toBe(icono);
  });
});

describe('extraerMensajeError', () => {
  it('une los mensajes de validación', () => {
    const error = { response: { data: { errores: [{ mensaje: 'a' }, { mensaje: 'b' }] } } };
    expect(extraerMensajeError(error)).toBe('a | b');
  });

  it('usa el mensaje del backend', () => {
    expect(extraerMensajeError({ response: { data: { mensaje: 'Ya existe' } } })).toBe('Ya existe');
  });

  it('usa el mensaje por defecto cuando no hay respuesta', () => {
    expect(extraerMensajeError(new Error('red'), 'Falló')).toBe('Falló');
    expect(extraerMensajeError(undefined)).toBe('Ocurrió un error inesperado');
  });
});
