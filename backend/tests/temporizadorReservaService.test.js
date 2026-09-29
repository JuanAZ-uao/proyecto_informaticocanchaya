const temporizadorService = require('../src/services/temporizadorReservaService');

describe('temporizadorReservaService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('inicia una sesión de 180s para (usuario, cancha)', () => {
    const sesion = temporizadorService.iniciarOTomarSesion('usuario-1', 'cancha-1');

    expect(sesion.estado).toBe('activo');
    expect(sesion.expiresAt - Date.now()).toBe(temporizadorService.DURACION_MS);
  });

  it('si ya hay una sesión activa, retoma el mismo expiresAt en vez de crear otra', () => {
    const primera = temporizadorService.iniciarOTomarSesion('usuario-2', 'cancha-2');
    jest.advanceTimersByTime(1000);
    const segunda = temporizadorService.iniciarOTomarSesion('usuario-2', 'cancha-2');

    expect(segunda.expiresAt).toBe(primera.expiresAt);
  });

  it('completarSesion marca la sesión como completada y detiene el temporizador', () => {
    temporizadorService.iniciarOTomarSesion('usuario-3', 'cancha-3');

    const resultado = temporizadorService.completarSesion('usuario-3', 'cancha-3');

    expect(resultado.estado).toBe('completado');
  });

  it('completarSesion lanza 409 si no hay sesión activa', () => {
    expect(() => temporizadorService.completarSesion('usuario-4', 'cancha-4')).toThrow(
      expect.objectContaining({ statusCode: 409 })
    );
  });

  it('completarSesion es idempotente: completar dos veces sin expirar no lanza error (permite volver atrás y reentrar al panel)', () => {
    temporizadorService.iniciarOTomarSesion('usuario-5', 'cancha-5');
    temporizadorService.completarSesion('usuario-5', 'cancha-5');

    const segundaVez = temporizadorService.completarSesion('usuario-5', 'cancha-5');
    expect(segundaVez.estado).toBe('completado');
  });

  it('al pasar los 180s emite el evento "expirado" y rechaza completar después', () => {
    const escuchaExpirado = jest.fn();
    temporizadorService.eventos.once('expirado', escuchaExpirado);

    temporizadorService.iniciarOTomarSesion('usuario-6', 'cancha-6');
    jest.advanceTimersByTime(temporizadorService.DURACION_MS + 1);

    expect(escuchaExpirado).toHaveBeenCalledWith({ key: 'usuario-6:cancha-6' });
    expect(() => temporizadorService.completarSesion('usuario-6', 'cancha-6')).toThrow(
      expect.objectContaining({ statusCode: 409 })
    );
  });

  it('emite sincronización periódica cada 5s mientras la sesión está activa', () => {
    const escuchaSync = jest.fn();
    temporizadorService.eventos.once('sync', escuchaSync);

    temporizadorService.iniciarOTomarSesion('usuario-7', 'cancha-7');
    jest.advanceTimersByTime(5000);

    expect(escuchaSync).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'usuario-7:cancha-7' })
    );
  });

  it('cancela la sesión solo cuando se desconecta el último socket (multi-pestaña)', () => {
    temporizadorService.iniciarOTomarSesion('usuario-8', 'cancha-8');
    temporizadorService.registrarSocket('usuario-8', 'cancha-8', 'socket-a');
    temporizadorService.registrarSocket('usuario-8', 'cancha-8', 'socket-b');

    temporizadorService.quitarSocket('usuario-8', 'cancha-8', 'socket-a');
    // Todavía queda socket-b conectado: la sesión debe seguir activa.
    expect(() => temporizadorService.completarSesion('usuario-8', 'cancha-8')).not.toThrow();
  });

  it('cancelarSesion detiene el temporizador y libera la clave', () => {
    temporizadorService.iniciarOTomarSesion('usuario-9', 'cancha-9');
    temporizadorService.cancelarSesion('usuario-9', 'cancha-9');

    expect(() => temporizadorService.completarSesion('usuario-9', 'cancha-9')).toThrow(
      expect.objectContaining({ statusCode: 409 })
    );
  });
});
