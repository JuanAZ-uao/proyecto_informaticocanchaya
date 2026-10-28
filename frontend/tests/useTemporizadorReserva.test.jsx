import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const falso = vi.hoisted(() => {
  const manejadores = {};
  const socket = {
    connected: true,
    on: vi.fn((evento, callback) => {
      manejadores[evento] = callback;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    timeout: vi.fn(),
  };
  return { manejadores, socket, io: vi.fn(() => socket) };
});
vi.mock('socket.io-client', () => ({ io: falso.io }));

import useTemporizadorReserva from '../src/hooks/useTemporizadorReserva';

const franja = { fecha: '2099-03-02', horaInicio: '06:00', horaFin: '07:00' };

function montar(opciones = {}, canchaId = 'c1', token = 'tok') {
  return renderHook(() => useTemporizadorReserva(canchaId, token, opciones));
}

describe('useTemporizadorReserva', () => {
  beforeEach(() => {
    Object.keys(falso.manejadores).forEach((clave) => delete falso.manejadores[clave]);
    falso.socket.connected = true;
  });

  it('se conecta con el token y la cancha, y se desconecta al salir', () => {
    const { unmount } = montar();

    expect(falso.io).toHaveBeenCalledWith(expect.any(String), { auth: { token: 'tok' }, query: { canchaId: 'c1' } });

    unmount();
    expect(falso.socket.disconnect).toHaveBeenCalled();
  });

  it('no se conecta sin cancha o sin token', () => {
    montar({}, null, 'tok');
    montar({}, 'c1', null);
    expect(falso.io).not.toHaveBeenCalled();
  });

  it('recibe el inicio de la sesión, avisa a la pantalla y calcula el desfase', () => {
    const onSesionIniciada = vi.fn();
    const { result } = montar({ onSesionIniciada });

    act(() => falso.manejadores['temporizador:inicio']({ expiresAt: 5000, estado: 'activo', ahora: Date.now() + 2000 }));

    expect(result.current.expiresAt).toBe(5000);
    expect(result.current.expirado).toBe(false);
    expect(result.current.desfaseMs).toBeGreaterThan(1000);
    expect(onSesionIniciada).toHaveBeenCalled();
  });

  it('marca la sesión como expirada cuando el servidor lo indica', () => {
    const { result } = montar();

    act(() => falso.manejadores['temporizador:inicio']({ expiresAt: 5000, estado: 'expirado' }));
    expect(result.current.expirado).toBe(true);

    act(() => falso.manejadores['temporizador:inicio']({ expiresAt: 9000, estado: 'activo' }));
    expect(result.current.expirado).toBe(false);

    act(() => falso.manejadores['temporizador:expirado']());
    expect(result.current.expirado).toBe(true);
  });

  it('actualiza la hora de vencimiento con cada sincronización', () => {
    const { result } = montar();

    act(() => falso.manejadores['temporizador:sync']({ expiresAt: 7000, ahora: Date.now() }));
    expect(result.current.expiresAt).toBe(7000);

    act(() => falso.manejadores['temporizador:sync']({ expiresAt: 8000 }));
    expect(result.current.expiresAt).toBe(8000);
  });

  it('reenvía a la pantalla los cambios de disponibilidad de otros usuarios', () => {
    const onCambioDisponibilidad = vi.fn();
    montar({ onCambioDisponibilidad });

    falso.manejadores['disponibilidad:retenida'](franja);
    falso.manejadores['disponibilidad:liberada'](franja);
    falso.manejadores['disponibilidad:reservada'](franja);

    expect(onCambioDisponibilidad).toHaveBeenNthCalledWith(1, 'retenida', franja);
    expect(onCambioDisponibilidad).toHaveBeenNthCalledWith(2, 'liberada', franja);
    expect(onCambioDisponibilidad).toHaveBeenNthCalledWith(3, 'reservada', franja);
  });

  it('ignora los eventos si la pantalla no registró manejadores', () => {
    montar();
    expect(() => falso.manejadores['disponibilidad:retenida'](franja)).not.toThrow();
    expect(() => falso.manejadores['temporizador:inicio']({ expiresAt: 1 })).not.toThrow();
  });

  it('reinicia el temporizador y toma el nuevo vencimiento', () => {
    const { result } = montar();
    falso.socket.emit.mockImplementation((evento, datos, ack) => ack({ expiresAt: 9000, ahora: Date.now() }));

    act(() => result.current.reiniciar());

    expect(falso.socket.emit).toHaveBeenCalledWith('temporizador:reiniciar', null, expect.any(Function));
    expect(result.current.expiresAt).toBe(9000);
    expect(result.current.expirado).toBe(false);
  });

  it('ignora una respuesta de reinicio sin vencimiento o sin argumentos', () => {
    const { result } = montar();

    falso.socket.emit.mockImplementation((evento, datos, ack) => ack({}));
    act(() => result.current.reiniciar());
    expect(result.current.expiresAt).toBeNull();

    falso.socket.emit.mockImplementation((evento, datos, ack) => ack());
    act(() => result.current.reiniciar());
    expect(result.current.expiresAt).toBeNull();

    falso.socket.emit.mockImplementation((evento, datos, ack) => ack({ expiresAt: 4000 }));
    act(() => result.current.reiniciar());
    expect(result.current.expiresAt).toBe(4000);
  });

  it('no falla al reiniciar si no hay conexión creada', () => {
    const { result } = montar({}, null);
    expect(() => result.current.reiniciar()).not.toThrow();
  });

  it('retiene una franja y devuelve la respuesta del servidor', async () => {
    const { result } = montar();
    falso.socket.timeout.mockReturnValue({ emit: (evento, datos, callback) => callback(null, { ok: true, retencion: datos }) });

    await expect(result.current.retenerFranja(franja)).resolves.toEqual({ ok: true, retencion: franja });
    expect(falso.socket.timeout).toHaveBeenCalledWith(8000);
  });

  it('informa un error si el servidor no responde a tiempo', async () => {
    const { result } = montar();
    falso.socket.timeout.mockReturnValue({ emit: (evento, datos, callback) => callback(new Error('timeout')) });

    const respuesta = await result.current.retenerFranja(franja);
    expect(respuesta).toEqual({ ok: false, error: { codigo: 'TIMEOUT', mensaje: expect.any(String) } });
  });

  it('informa un error si no hay conexión con el servidor', async () => {
    const { result } = montar();
    falso.socket.connected = false;

    const respuesta = await result.current.retenerFranja(franja);
    expect(respuesta.error.codigo).toBe('SIN_CONEXION');
  });

  it('libera la franja retenida', () => {
    const { result } = montar();
    result.current.liberarFranja();
    expect(falso.socket.emit).toHaveBeenCalledWith('retencion:liberar', null, expect.any(Function));
  });
});
