jest.mock('../src/repositories/retencionRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/sesionReservaRepository');

const retencionRepository = require('../src/repositories/retencionRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const temporizadorService = require('../src/services/temporizadorReservaService');
const retencionService = require('../src/services/retencionService');

const USUARIO = 'usuario-1';
const OTRO_USUARIO = 'usuario-2';
const CANCHA = 'cancha-1';
const FRANJA = { fecha: '2099-06-01', horaInicio: '10:00', horaFin: '11:00' };

function retencion(datos = {}) {
  return { id: 'ret-1', usuarioId: USUARIO, canchaId: CANCHA, ...FRANJA, expiresAt: Date.now() + 60000, ...datos };
}

function escuchar(evento) {
  const escucha = jest.fn();
  retencionService.eventos.on(evento, escucha);
  return escucha;
}

describe('retencionService (US-18)', () => {
  let escuchas;

  beforeEach(async () => {
    jest.clearAllMocks();
    reservaRepository.existeConfirmada.mockResolvedValue(false);
    retencionRepository.liberarDeUsuario.mockResolvedValue(null);
    retencionRepository.obtenerVigentePorFranja.mockResolvedValue(null);
    escuchas = { retenida: escuchar('retenida'), liberada: escuchar('liberada'), reservada: escuchar('reservada') };
    await temporizadorService.iniciarOTomarSesion(USUARIO, CANCHA);
  });

  afterEach(async () => {
    retencionService.eventos.removeAllListeners('retenida');
    retencionService.eventos.removeAllListeners('liberada');
    retencionService.eventos.removeAllListeners('reservada');
    await temporizadorService.cancelarSesion(USUARIO, CANCHA);
  });

  it('retiene la franja hasta el vencimiento de la sesión y avisa a los demás', async () => {
    const sesion = temporizadorService.obtenerSesion(USUARIO, CANCHA);
    retencionRepository.retener.mockResolvedValue({ retencion: retencion(), anterior: null });

    await retencionService.retenerFranja(USUARIO, CANCHA, FRANJA);

    expect(retencionRepository.retener).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: USUARIO, canchaId: CANCHA, ...FRANJA, expiresAt: sesion.expiresAt })
    );
    expect(escuchas.retenida).toHaveBeenCalledWith({
      usuarioId: USUARIO,
      franja: { canchaId: CANCHA, ...FRANJA },
    });
  });

  it('al elegir otra franja libera la anterior y retiene la nueva', async () => {
    const anterior = retencion({ horaInicio: '08:00', horaFin: '09:00' });
    retencionRepository.retener.mockResolvedValue({ retencion: retencion(), anterior });

    await retencionService.retenerFranja(USUARIO, CANCHA, FRANJA);

    expect(escuchas.liberada).toHaveBeenCalledWith(
      expect.objectContaining({ franja: expect.objectContaining({ horaInicio: '08:00' }) })
    );
    expect(escuchas.retenida).toHaveBeenCalledWith(
      expect.objectContaining({ franja: expect.objectContaining({ horaInicio: '10:00' }) })
    );
  });

  it('volver a retener la misma franja (p. ej. al reconectar) no genera avisos duplicados', async () => {
    retencionRepository.retener.mockResolvedValue({ retencion: retencion(), anterior: retencion() });

    await retencionService.retenerFranja(USUARIO, CANCHA, FRANJA);

    expect(escuchas.retenida).not.toHaveBeenCalled();
    expect(escuchas.liberada).not.toHaveBeenCalled();
  });

  it('rechaza con FRANJA_RETENIDA si otro usuario ya la retiene (índice único)', async () => {
    const errorPostgres = new Error('duplicate key');
    errorPostgres.code = '23505';
    retencionRepository.retener.mockRejectedValue(errorPostgres);

    await expect(retencionService.retenerFranja(USUARIO, CANCHA, FRANJA)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'FRANJA_RETENIDA',
    });
    expect(escuchas.retenida).not.toHaveBeenCalled();
  });

  it('rechaza con FRANJA_OCUPADA si la franja ya está reservada', async () => {
    reservaRepository.existeConfirmada.mockResolvedValue(true);

    await expect(retencionService.retenerFranja(USUARIO, CANCHA, FRANJA)).rejects.toMatchObject({
      codigo: 'FRANJA_OCUPADA',
    });
    expect(retencionRepository.retener).not.toHaveBeenCalled();
  });

  it('rechaza con SESION_EXPIRADA si el usuario no tiene sesión en la cancha', async () => {
    await expect(retencionService.retenerFranja(USUARIO, 'otra-cancha', FRANJA)).rejects.toMatchObject({
      codigo: 'SESION_EXPIRADA',
    });
  });

  it('rechaza con HORA_PASADA o DATOS_INVALIDOS ante franjas no válidas', async () => {
    await expect(
      retencionService.retenerFranja(USUARIO, CANCHA, { fecha: '2020-01-01', horaInicio: '10:00', horaFin: '11:00' })
    ).rejects.toMatchObject({ codigo: 'HORA_PASADA' });
    await expect(retencionService.retenerFranja(USUARIO, CANCHA, { fecha: 'x' })).rejects.toMatchObject({
      codigo: 'DATOS_INVALIDOS',
    });
  });

  it('cuando la sesión termina (expira o el usuario sale) libera su franja y avisa', async () => {
    retencionRepository.liberarDeUsuario.mockResolvedValue(retencion());

    await temporizadorService.cancelarSesion(USUARIO, CANCHA, 'salio');
    await new Promise((resolve) => setImmediate(resolve));

    expect(retencionRepository.liberarDeUsuario).toHaveBeenCalledWith(USUARIO, CANCHA);
    expect(escuchas.liberada).toHaveBeenCalledWith({ usuarioId: USUARIO, franja: { canchaId: CANCHA, ...FRANJA } });
  });

  it('al confirmar, la retención se convierte en reserva y se avisa "reservada" (no "liberada")', async () => {
    retencionRepository.liberarDeUsuario.mockResolvedValue(retencion());

    await retencionService.convertirEnReserva(USUARIO, CANCHA, { ...FRANJA, horaInicio: '10:00:00', horaFin: '11:00:00' });

    expect(escuchas.reservada).toHaveBeenCalledWith({ usuarioId: USUARIO, franja: { canchaId: CANCHA, ...FRANJA } });
    expect(escuchas.liberada).not.toHaveBeenCalled();
  });

  it('no deja reservar una franja que otro usuario tiene retenida', async () => {
    retencionRepository.obtenerVigentePorFranja.mockResolvedValue(retencion({ usuarioId: OTRO_USUARIO }));

    await expect(
      retencionService.verificarDisponibleParaReservar(USUARIO, CANCHA, FRANJA.fecha, FRANJA.horaInicio)
    ).rejects.toMatchObject({ statusCode: 409, codigo: 'FRANJA_RETENIDA' });
  });

  it('sí deja reservar la franja que el propio usuario retiene', async () => {
    retencionRepository.obtenerVigentePorFranja.mockResolvedValue(retencion());

    await expect(
      retencionService.verificarDisponibleParaReservar(USUARIO, CANCHA, FRANJA.fecha, FRANJA.horaInicio)
    ).resolves.toBeUndefined();
  });

  it('lista las franjas retenidas por otros sin exponer quién las retiene', async () => {
    retencionRepository.listarVigentesPorCanchaYFecha.mockResolvedValue([
      retencion(),
      retencion({ usuarioId: OTRO_USUARIO, horaInicio: '12:00', horaFin: '13:00' }),
    ]);

    const retenidas = await retencionService.listarRetenidasPorOtros(CANCHA, FRANJA.fecha, USUARIO);

    expect(retenidas).toEqual([{ canchaId: CANCHA, fecha: FRANJA.fecha, horaInicio: '12:00', horaFin: '13:00' }]);
  });

  it('el barrido elimina retenciones vencidas y avisa que quedaron libres', async () => {
    retencionRepository.eliminarVencidas.mockResolvedValue([retencion({ usuarioId: OTRO_USUARIO })]);

    const total = await retencionService.barrerVencidas();

    expect(total).toBe(1);
    expect(escuchas.liberada).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: OTRO_USUARIO }));
  });
});
