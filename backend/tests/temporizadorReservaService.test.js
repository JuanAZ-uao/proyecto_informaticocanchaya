jest.mock('../src/repositories/sesionReservaRepository');

const sesionRepository = require('../src/repositories/sesionReservaRepository');
const temporizadorService = require('../src/services/temporizadorReservaService');

describe('temporizadorReservaService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sesionRepository.obtener.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('inicia una sesión de 180s para (usuario, cancha) y la guarda en la base', async () => {
    const sesion = await temporizadorService.iniciarOTomarSesion('usuario-1', 'cancha-1');

    expect(sesion.estado).toBe('activo');
    expect(sesion.expiresAt - Date.now()).toBe(temporizadorService.DURACION_MS);
    expect(sesionRepository.guardar).toHaveBeenCalledWith({
      usuarioId: 'usuario-1',
      canchaId: 'cancha-1',
      expiresAt: sesion.expiresAt,
      estado: 'activo',
    });
  });

  it('si ya hay una sesión activa, retoma el mismo expiresAt en vez de crear otra', async () => {
    const primera = await temporizadorService.iniciarOTomarSesion('usuario-2', 'cancha-2');
    jest.advanceTimersByTime(1000);
    const segunda = await temporizadorService.iniciarOTomarSesion('usuario-2', 'cancha-2');

    expect(segunda.expiresAt).toBe(primera.expiresAt);
  });

  it('US-18: tras un reinicio retoma la sesión guardada con el mismo expiresAt', async () => {
    const expiresAtGuardado = Date.now() + 90000;
    sesionRepository.obtener.mockResolvedValue({
      usuarioId: 'usuario-10',
      canchaId: 'cancha-10',
      expiresAt: expiresAtGuardado,
      estado: 'activo',
    });

    const sesion = await temporizadorService.iniciarOTomarSesion('usuario-10', 'cancha-10');

    expect(sesion.expiresAt).toBe(expiresAtGuardado);
    expect(sesionRepository.guardar).not.toHaveBeenCalled();
  });

  it('US-18: restaurarSesiones reprograma las sesiones vigentes y luego expiran a su hora', async () => {
    const escuchaTerminada = jest.fn();
    temporizadorService.eventos.on('terminada', escuchaTerminada);
    sesionRepository.listarActivasVigentes.mockResolvedValue([
      { usuarioId: 'usuario-11', canchaId: 'cancha-11', expiresAt: Date.now() + 20000, estado: 'activo' },
    ]);

    const restauradas = await temporizadorService.restaurarSesiones();
    expect(restauradas).toBe(1);
    expect(sesionRepository.eliminarVencidas).toHaveBeenCalled();
    expect(temporizadorService.obtenerSesion('usuario-11', 'cancha-11')).toMatchObject({ estado: 'activo' });

    jest.advanceTimersByTime(20001);
    expect(escuchaTerminada).toHaveBeenCalledWith({ usuarioId: 'usuario-11', canchaId: 'cancha-11', motivo: 'expirada' });
    temporizadorService.eventos.off('terminada', escuchaTerminada);
  });

  it('completarSesion marca la sesión como completada, detiene el temporizador y lo persiste', async () => {
    await temporizadorService.iniciarOTomarSesion('usuario-3', 'cancha-3');

    const resultado = await temporizadorService.completarSesion('usuario-3', 'cancha-3');

    expect(resultado.estado).toBe('completado');
    expect(sesionRepository.actualizarEstado).toHaveBeenCalledWith('usuario-3', 'cancha-3', 'completado');
  });

  it('completarSesion lanza 409 si no hay sesión activa', async () => {
    await expect(temporizadorService.completarSesion('usuario-4', 'cancha-4')).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'SESION_EXPIRADA',
    });
  });

  it('completarSesion es idempotente: completar dos veces sin expirar no lanza error (permite volver atrás y reentrar al panel)', async () => {
    await temporizadorService.iniciarOTomarSesion('usuario-5', 'cancha-5');
    await temporizadorService.completarSesion('usuario-5', 'cancha-5');

    const segundaVez = await temporizadorService.completarSesion('usuario-5', 'cancha-5');
    expect(segundaVez.estado).toBe('completado');
  });

  it('al pasar los 180s emite "expirado" y "terminada", borra la sesión y rechaza completar después', async () => {
    const escuchaExpirado = jest.fn();
    const escuchaTerminada = jest.fn();
    temporizadorService.eventos.once('expirado', escuchaExpirado);
    temporizadorService.eventos.on('terminada', escuchaTerminada);

    await temporizadorService.iniciarOTomarSesion('usuario-6', 'cancha-6');
    jest.advanceTimersByTime(temporizadorService.DURACION_MS + 1);

    expect(escuchaExpirado).toHaveBeenCalledWith({ key: 'usuario-6:cancha-6' });
    expect(escuchaTerminada).toHaveBeenCalledWith({ usuarioId: 'usuario-6', canchaId: 'cancha-6', motivo: 'expirada' });
    expect(sesionRepository.eliminar).toHaveBeenCalledWith('usuario-6', 'cancha-6');
    await expect(temporizadorService.completarSesion('usuario-6', 'cancha-6')).rejects.toMatchObject({
      statusCode: 409,
    });
    temporizadorService.eventos.off('terminada', escuchaTerminada);
  });

  it('emite sincronización periódica cada 5s mientras la sesión está activa', async () => {
    const escuchaSync = jest.fn();
    temporizadorService.eventos.once('sync', escuchaSync);

    await temporizadorService.iniciarOTomarSesion('usuario-7', 'cancha-7');
    jest.advanceTimersByTime(5000);

    expect(escuchaSync).toHaveBeenCalledWith(expect.objectContaining({ key: 'usuario-7:cancha-7' }));
  });

  it('cancela la sesión solo cuando se desconecta el último socket (multi-pestaña)', async () => {
    await temporizadorService.iniciarOTomarSesion('usuario-8', 'cancha-8');
    temporizadorService.registrarSocket('usuario-8', 'cancha-8', 'socket-a');
    temporizadorService.registrarSocket('usuario-8', 'cancha-8', 'socket-b');

    await temporizadorService.quitarSocket('usuario-8', 'cancha-8', 'socket-a');
    // Todavía queda socket-b conectado: la sesión debe seguir activa.
    await expect(temporizadorService.completarSesion('usuario-8', 'cancha-8')).resolves.toMatchObject({
      estado: 'completado',
    });
  });

  it('US-18: al salir el último socket emite "terminada" (para liberar la franja) y borra la sesión', async () => {
    const escuchaTerminada = jest.fn();
    temporizadorService.eventos.on('terminada', escuchaTerminada);
    await temporizadorService.iniciarOTomarSesion('usuario-12', 'cancha-12');
    temporizadorService.registrarSocket('usuario-12', 'cancha-12', 'socket-a');

    await temporizadorService.quitarSocket('usuario-12', 'cancha-12', 'socket-a');

    expect(escuchaTerminada).toHaveBeenCalledWith({ usuarioId: 'usuario-12', canchaId: 'cancha-12', motivo: 'salio' });
    expect(sesionRepository.eliminar).toHaveBeenCalledWith('usuario-12', 'cancha-12');
    temporizadorService.eventos.off('terminada', escuchaTerminada);
  });

  it('cancelarSesion detiene el temporizador y libera la clave', async () => {
    await temporizadorService.iniciarOTomarSesion('usuario-9', 'cancha-9');
    await temporizadorService.cancelarSesion('usuario-9', 'cancha-9');

    await expect(temporizadorService.completarSesion('usuario-9', 'cancha-9')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
