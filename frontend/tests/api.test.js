import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cliente = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../src/api/axiosClient', () => ({ default: cliente }));

import { iniciarSesion, registrarUsuario, restablecerPassword, solicitarRecuperacion, verificarCorreo } from '../src/api/authApi';
import { actualizarPerfil, agregarMetodoPago, cambiarPassword, eliminarMetodoPago, listarMetodosPago, obtenerPerfil, solicitarCambioCorreo } from '../src/api/perfilApi';
import { listarVerificaciones, marcarReservaUsada, verificarCodigoReserva } from '../src/api/adminApi';
import { crearReserva, entrarPanelReserva, obtenerBloquesOcupados, obtenerCanchaPorId, obtenerCanchas } from '../src/api/canchasApi';
import { cancelarReserva, obtenerMisReservas } from '../src/api/reservasApi';

describe('authApi', () => {
  it('llama a los endpoints de autenticación con el cuerpo esperado', () => {
    registrarUsuario({ nombre: 'Ana', correo: 'a@a.co', telefono: '300', password: 'Clave123' });
    iniciarSesion({ correo: 'a@a.co', password: 'Clave123' });
    solicitarRecuperacion({ correo: 'a@a.co' });
    restablecerPassword({ token: 't', nuevaPassword: 'Nueva123' });

    expect(cliente.post).toHaveBeenNthCalledWith(1, '/auth/registro', { nombre: 'Ana', correo: 'a@a.co', telefono: '300', password: 'Clave123' });
    expect(cliente.post).toHaveBeenNthCalledWith(2, '/auth/login', { correo: 'a@a.co', password: 'Clave123' });
    expect(cliente.post).toHaveBeenNthCalledWith(3, '/auth/olvide-password', { correo: 'a@a.co' });
    expect(cliente.post).toHaveBeenNthCalledWith(4, '/auth/restablecer-password', { token: 't', nuevaPassword: 'Nueva123' });
  });
});

describe('canchasApi', () => {
  it('arma los filtros solo con los valores informados', () => {
    obtenerCanchas({ zona: 'Norte', precioMin: '10000', precioMax: '50000', fecha: '2026-10-01' });
    obtenerCanchas();

    expect(cliente.get).toHaveBeenNthCalledWith(1, '/canchas', {
      params: { zona: 'Norte', precioMin: '10000', precioMax: '50000', fecha: '2026-10-01' },
    });
    expect(cliente.get).toHaveBeenNthCalledWith(2, '/canchas', { params: {} });
  });

  it('consulta detalle, disponibilidad, reserva y panel de confirmación', () => {
    const franja = { fecha: '2026-10-01', horaInicio: '10:00', horaFin: '11:00' };
    obtenerCanchaPorId('c1');
    obtenerBloquesOcupados('c1', '2026-10-01');
    crearReserva('c1', franja);
    entrarPanelReserva('c1', franja);

    expect(cliente.get).toHaveBeenCalledWith('/canchas/c1');
    expect(cliente.get).toHaveBeenCalledWith('/canchas/c1/disponibilidad', { params: { fecha: '2026-10-01' } });
    expect(cliente.post).toHaveBeenCalledWith('/canchas/c1/reservas', franja);
    expect(cliente.post).toHaveBeenCalledWith('/canchas/c1/temporizador/completar', franja);
  });
});

describe('reservasApi', () => {
  it('pide el historial con periodo, página y filtro de estado', () => {
    obtenerMisReservas({ periodo: 'pasadas', estado: 'cancelada', pagina: 2, limite: 5 });
    obtenerMisReservas();

    expect(cliente.get).toHaveBeenNthCalledWith(1, '/reservas', { params: { periodo: 'pasadas', pagina: 2, limite: 5, estado: 'cancelada' } });
    expect(cliente.get).toHaveBeenNthCalledWith(2, '/reservas', { params: { periodo: 'proximas', pagina: 1, limite: 10 } });
  });
});

describe('axiosClient (interceptores)', () => {
  let axiosClient;

  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('../src/api/axiosClient');
    ({ default: axiosClient } = await import('../src/api/axiosClient'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('agrega el token guardado a cada petición', () => {
    const [{ fulfilled }] = axiosClient.interceptors.request.handlers;

    localStorage.setItem('canchaya_token', 'abc');
    expect(fulfilled({ headers: {} }).headers.Authorization).toBe('Bearer abc');

    localStorage.clear();
    expect(fulfilled({ headers: {} }).headers.Authorization).toBeUndefined();
  });

  it('deja pasar las respuestas exitosas', () => {
    const [{ fulfilled }] = axiosClient.interceptors.response.handlers;
    expect(fulfilled({ data: 1 })).toEqual({ data: 1 });
  });

  it('cierra la sesión y manda al login cuando el token venció (401)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/canchas', search: '?zona=Norte', assign });
    localStorage.setItem('canchaya_token', 'abc');
    localStorage.setItem('canchaya_usuario', '{}');

    const [{ rejected }] = axiosClient.interceptors.response.handlers;
    const error = { response: { status: 401 }, config: { url: '/canchas' } };

    await expect(rejected(error)).rejects.toBe(error);
    expect(localStorage.getItem('canchaya_token')).toBeNull();
    expect(assign).toHaveBeenCalledWith('/login?redirect=%2Fcanchas%3Fzona%3DNorte');

    // un segundo 401 no vuelve a redirigir
    localStorage.setItem('canchaya_token', 'abc');
    await expect(rejected(error)).rejects.toBe(error);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('no redirige si el 401 viene del login o si no había sesión', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/login', search: '', assign });
    const [{ rejected }] = axiosClient.interceptors.response.handlers;

    localStorage.setItem('canchaya_token', 'abc');
    await expect(rejected({ response: { status: 401 }, config: { url: '/auth/login' } })).rejects.toBeDefined();

    localStorage.clear();
    await expect(rejected({ response: { status: 401 }, config: { url: '/canchas' } })).rejects.toBeDefined();
    await expect(rejected({ response: { status: 500 }, config: { url: '/canchas' } })).rejects.toBeDefined();

    expect(assign).not.toHaveBeenCalled();
  });
});

describe('canchasApi: pago opcional (US-28)', () => {
  const franja = { fecha: '2026-10-01', horaInicio: '10:00', horaFin: '11:00' };

  it('envía el metodoPagoId solo cuando hay una tarjeta elegida', () => {
    crearReserva('c1', { ...franja, metodoPagoId: 'm1' });
    crearReserva('c1', { ...franja, metodoPagoId: '' });
    crearReserva('c1', franja);

    expect(cliente.post).toHaveBeenNthCalledWith(1, '/canchas/c1/reservas', { ...franja, metodoPagoId: 'm1' });
    expect(cliente.post).toHaveBeenNthCalledWith(2, '/canchas/c1/reservas', franja);
    expect(cliente.post).toHaveBeenNthCalledWith(3, '/canchas/c1/reservas', franja);
  });
});

describe('reservasApi: cancelación (US-14)', () => {
  it('cancela con PATCH a la ruta de la reserva', () => {
    cancelarReserva('r1');

    expect(cliente.patch).toHaveBeenCalledWith('/reservas/r1/cancelar');
  });
});

describe('authApi: verificación del correo (US-27)', () => {
  it('envía el token del enlace', () => {
    verificarCorreo({ token: 'abc' });

    expect(cliente.post).toHaveBeenCalledWith('/auth/verificar-correo', { token: 'abc' });
  });
});

describe('perfilApi (US-27 y US-28)', () => {
  it('usa siempre el id del propio usuario en la ruta', () => {
    obtenerPerfil('u1');
    actualizarPerfil('u1', { nombre: 'Ana', telefono: '3001234567' });
    cambiarPassword('u1', { passwordActual: 'a', nuevaPassword: 'b' });
    solicitarCambioCorreo('u1', { nuevoCorreo: 'n@c.co' });

    expect(cliente.get).toHaveBeenCalledWith('/usuarios/u1');
    expect(cliente.patch).toHaveBeenCalledWith('/usuarios/u1', { nombre: 'Ana', telefono: '3001234567' });
    expect(cliente.patch).toHaveBeenCalledWith('/usuarios/u1/password', { passwordActual: 'a', nuevaPassword: 'b' });
    expect(cliente.post).toHaveBeenCalledWith('/usuarios/u1/correo', { nuevoCorreo: 'n@c.co' });
  });

  it('gestiona las tarjetas con sus rutas', () => {
    const tarjeta = { numero: '4242 4242 4242 4242', titular: 'Ana', vencimientoMes: '12', vencimientoAnio: '30', cvv: '123' };
    listarMetodosPago('u1');
    agregarMetodoPago('u1', tarjeta);
    eliminarMetodoPago('u1', 'm1');

    expect(cliente.get).toHaveBeenCalledWith('/usuarios/u1/metodos-pago');
    expect(cliente.post).toHaveBeenCalledWith('/usuarios/u1/metodos-pago', tarjeta);
    expect(cliente.delete).toHaveBeenCalledWith('/usuarios/u1/metodos-pago/m1');
  });
});

describe('adminApi (US-29)', () => {
  it('verifica, marca como utilizada y lista la auditoría', () => {
    verificarCodigoReserva('CY-D1AD1C79');
    marcarReservaUsada('CY-D1AD1C79');
    listarVerificaciones();
    listarVerificaciones(5);

    expect(cliente.post).toHaveBeenCalledWith('/admin/reservas/verificar', { codigo: 'CY-D1AD1C79' });
    expect(cliente.post).toHaveBeenCalledWith('/admin/reservas/CY-D1AD1C79/usar');
    expect(cliente.get).toHaveBeenNthCalledWith(1, '/admin/verificaciones', { params: { limite: 20 } });
    expect(cliente.get).toHaveBeenNthCalledWith(2, '/admin/verificaciones', { params: { limite: 5 } });
  });

  it('codifica el código en la ruta para que un valor raro no cambie el destino', () => {
    marcarReservaUsada('../x?y=1');

    expect(cliente.post).toHaveBeenCalledWith('/admin/reservas/..%2Fx%3Fy%3D1/usar');
  });
});
