import { describe, expect, it } from 'vitest';
import { esBloquePasado, obtenerFechaHoyColombia } from '../src/utils/fechaHora';
import { formatearFechaLarga, formatearHora, formateadorMoneda } from '../src/utils/formato';
import iconoServicio from '../src/utils/iconoServicio';
import extraerMensajeError, { erroresPorCampo } from '../src/api/extraerMensajeError';
import { esConexionSegura, formatearNumeroTarjeta, formatearVencimiento, separarVencimiento } from '../src/utils/tarjeta';
import { afterEach, vi } from 'vitest';

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

describe('erroresPorCampo', () => {
  it('convierte la lista de errores del servidor en un objeto por campo', () => {
    const error = { response: { data: { errores: [{ campo: 'nombre', mensaje: 'Obligatorio' }, { campo: 'telefono', mensaje: 'Inválido' }] } } };
    expect(erroresPorCampo(error)).toEqual({ nombre: 'Obligatorio', telefono: 'Inválido' });
  });

  it('ignora entradas sin campo y devuelve un objeto vacío si no hay lista', () => {
    expect(erroresPorCampo({ response: { data: { errores: [{ mensaje: 'sin campo' }, null] } } })).toEqual({});
    expect(erroresPorCampo({ response: { data: { mensaje: 'Error' } } })).toEqual({});
    expect(erroresPorCampo(undefined)).toEqual({});
  });
});

describe('utilidades de tarjeta (US-28)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('agrupa el número de 4 en 4 y descarta lo que no son dígitos', () => {
    expect(formatearNumeroTarjeta('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatearNumeroTarjeta('4242-4242 abcd 4242')).toBe('4242 4242 4242');
    expect(formatearNumeroTarjeta('424')).toBe('424');
    expect(formatearNumeroTarjeta('1'.repeat(25))).toBe('1111 1111 1111 1111 111');
    expect(formatearNumeroTarjeta(undefined)).toBe('');
  });

  it('da formato MM/AA al vencimiento sin agregar la barra antes de tiempo', () => {
    expect(formatearVencimiento('1')).toBe('1');
    expect(formatearVencimiento('12')).toBe('12');
    expect(formatearVencimiento('123')).toBe('12/3');
    expect(formatearVencimiento('1230')).toBe('12/30');
    expect(formatearVencimiento('12/30/99')).toBe('12/30');
    expect(formatearVencimiento(null)).toBe('');
  });

  it('separa el vencimiento en mes y año', () => {
    expect(separarVencimiento('12/30')).toEqual({ vencimientoMes: '12', vencimientoAnio: '30' });
    expect(separarVencimiento('12')).toEqual({ vencimientoMes: '12', vencimientoAnio: '' });
    expect(separarVencimiento('')).toEqual({ vencimientoMes: '', vencimientoAnio: '' });
    expect(separarVencimiento(undefined)).toEqual({ vencimientoMes: '', vencimientoAnio: '' });
  });

  it('considera segura una conexión HTTPS o localhost, y no una HTTP en otro dominio', () => {
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'canchaya.com' });
    expect(esConexionSegura()).toBe(true);

    vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost' });
    expect(esConexionSegura()).toBe(true);

    vi.stubGlobal('location', { protocol: 'http:', hostname: '127.0.0.1' });
    expect(esConexionSegura()).toBe(true);

    vi.stubGlobal('location', { protocol: 'http:', hostname: 'canchaya.com' });
    expect(esConexionSegura()).toBe(false);
  });
});
