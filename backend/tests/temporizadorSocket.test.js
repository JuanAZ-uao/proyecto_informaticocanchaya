// Prueba del socket de la sesión de reserva y la retención de franjas (US-17 y US-18):
// un servidor Socket.IO real con clientes reales; solo los repositorios (base de datos) están simulados.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
// Los repositorios están simulados: la base no se usa, solo hace falta que la variable exista (sin credenciales).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/prueba';

jest.mock('../src/repositories/retencionRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/horarioRepository');
jest.mock('../src/repositories/sesionReservaRepository');

const http = require('http');
const { Server } = require('socket.io');
const { io: conectarCliente } = require('socket.io-client');
const retencionRepository = require('../src/repositories/retencionRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const horarioRepository = require('../src/repositories/horarioRepository');
const temporizadorService = require('../src/services/temporizadorReservaService');
const retencionService = require('../src/services/retencionService');
const registrarTemporizadorSocket = require('../src/sockets/temporizadorSocket');
const { generarToken } = require('../src/utils/jwt');

const ANA = 'usuario-ana';
const LUIS = 'usuario-luis';
const CANCHA = 'cancha-1';
const FRANJA = { fecha: '2099-06-01', horaInicio: '10:00', horaFin: '11:00' };
const ESPERA_MS = 3000;

let servidorHttp;
let servidorIo;
let url;
let clientes = [];

function conectar(usuarioId, { canchaId = CANCHA, token } = {}) {
  const cliente = conectarCliente(url, {
    auth: { token: token === undefined ? generarToken({ sub: usuarioId }) : token },
    query: canchaId ? { canchaId } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clientes.push(cliente);
  return cliente;
}

function esperar(cliente, evento) {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(`No llegó "${evento}"`)), ESPERA_MS);
    cliente.once(evento, (datos) => {
      clearTimeout(temporizador);
      resolve(datos);
    });
  });
}

async function conectarYEsperarInicio(usuarioId, opciones) {
  const cliente = conectar(usuarioId, opciones);
  const inicio = await esperar(cliente, 'temporizador:inicio');
  return { cliente, inicio };
}

function pedir(cliente, evento, datos) {
  return new Promise((resolve) => cliente.emit(evento, datos, resolve));
}

// Da tiempo a que el servidor procese un aviso que NO debería llegar.
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('temporizadorSocket', () => {
  beforeAll((hecho) => {
    servidorHttp = http.createServer();
    servidorIo = new Server(servidorHttp);
    registrarTemporizadorSocket(servidorIo);
    servidorHttp.listen(0, () => {
      url = `http://localhost:${servidorHttp.address().port}`;
      hecho();
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => servidorIo.close(resolve));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    horarioRepository.listarPorCancha.mockResolvedValue(
      [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, horaInicio: '06:00:00', horaFin: '22:00:00' }))
    );
    reservaRepository.existeConfirmada.mockResolvedValue(false);
    retencionRepository.retener.mockImplementation(async ({ usuarioId, canchaId, fecha, horaInicio, horaFin, expiresAt }) => ({
      retencion: { id: 'ret-1', usuarioId, canchaId, fecha, horaInicio, horaFin, expiresAt },
      anterior: null,
    }));
    retencionRepository.liberarDeUsuario.mockResolvedValue(null);
  });

  afterEach(async () => {
    clientes.forEach((cliente) => cliente.disconnect());
    clientes = [];
    await temporizadorService.cancelarSesion(ANA, CANCHA);
    await temporizadorService.cancelarSesion(LUIS, CANCHA);
  });

  describe('conexión', () => {
    it('rechaza una conexión sin token', async () => {
      const cliente = conectar(ANA, { token: null });
      const error = await esperar(cliente, 'connect_error');
      expect(error.message).toBe('No autenticado');
    });

    it('rechaza una conexión con un token inválido', async () => {
      const cliente = conectar(ANA, { token: 'token-falso' });
      const error = await esperar(cliente, 'connect_error');
      expect(error.message).toBe('Token inválido o expirado');
    });

    it('avisa y cierra la conexión si falta el id de la cancha', async () => {
      const cliente = conectar(ANA, { canchaId: null });
      const cierre = esperar(cliente, 'disconnect');
      const aviso = await esperar(cliente, 'temporizador:error');
      expect(aviso).toEqual({ mensaje: 'Falta el id de la cancha' });
      await cierre;
    });

    it('inicia la sesión de 180 s y se la informa al cliente', async () => {
      const { inicio } = await conectarYEsperarInicio(ANA);

      expect(inicio.estado).toBe('activo');
      expect(inicio.expiresAt).toBeGreaterThan(Date.now() + 170000);
      expect(inicio.ahora).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('retención de franjas', () => {
    it('retiene la franja, lo confirma al usuario y avisa a los demás sin decir quién la retuvo', async () => {
      const { cliente: ana } = await conectarYEsperarInicio(ANA);
      const { cliente: luis } = await conectarYEsperarInicio(LUIS);
      const avisoParaLuis = esperar(luis, 'disponibilidad:retenida');
      const confirmacionParaAna = esperar(ana, 'retencion:confirmada');

      const respuesta = await pedir(ana, 'retencion:solicitar', FRANJA);

      expect(respuesta.ok).toBe(true);
      expect(respuesta.retencion).toEqual({ ...FRANJA, expiresAt: expect.any(Number) });
      expect(await confirmacionParaAna).toEqual({ ...FRANJA, expiresAt: expect.any(Number) });
      expect(await avisoParaLuis).toEqual({ canchaId: CANCHA, ...FRANJA });
    });

    it('no avisa de la retención al propio usuario que la hizo', async () => {
      const { cliente: ana } = await conectarYEsperarInicio(ANA);
      const recibidos = [];
      ana.on('disponibilidad:retenida', (datos) => recibidos.push(datos));

      await pedir(ana, 'retencion:solicitar', FRANJA);
      await pausa(150);

      expect(recibidos).toHaveLength(0);
    });

    it('responde con un error claro si la franja es inválida', async () => {
      const { cliente } = await conectarYEsperarInicio(ANA);

      const respuesta = await pedir(cliente, 'retencion:solicitar', { fecha: 'mañana' });

      expect(respuesta.ok).toBe(false);
      expect(respuesta.error.codigo).toBe('DATOS_INVALIDOS');
    });

    it('responde FRANJA_RETENIDA si otro usuario ya la retiene', async () => {
      retencionRepository.retener.mockRejectedValue(Object.assign(new Error('duplicado'), { code: '23505' }));
      const { cliente } = await conectarYEsperarInicio(ANA);

      const respuesta = await pedir(cliente, 'retencion:solicitar', FRANJA);

      expect(respuesta).toEqual({
        ok: false,
        error: { codigo: 'FRANJA_RETENIDA', mensaje: 'Otro usuario está reservando esta franja en este momento' },
      });
    });

    it('oculta los errores internos al cliente', async () => {
      const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
      retencionRepository.retener.mockRejectedValue(new Error('la base se cayó'));
      const { cliente } = await conectarYEsperarInicio(ANA);

      const respuesta = await pedir(cliente, 'retencion:solicitar', FRANJA);

      expect(respuesta).toEqual({ ok: false, error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
      silencio.mockRestore();
    });

    it('libera la franja a pedido del usuario y avisa a los demás', async () => {
      retencionRepository.liberarDeUsuario.mockResolvedValue({ id: 'ret-1', usuarioId: ANA, canchaId: CANCHA, ...FRANJA });
      const { cliente: ana } = await conectarYEsperarInicio(ANA);
      const { cliente: luis } = await conectarYEsperarInicio(LUIS);
      const avisoParaLuis = esperar(luis, 'disponibilidad:liberada');

      const respuesta = await pedir(ana, 'retencion:liberar');

      expect(respuesta).toEqual({ ok: true });
      expect(await avisoParaLuis).toEqual({ canchaId: CANCHA, ...FRANJA });
    });

    it('informa un error interno si no se puede liberar', async () => {
      const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
      retencionRepository.liberarDeUsuario.mockRejectedValue(new Error('la base se cayó'));
      const { cliente } = await conectarYEsperarInicio(ANA);

      const respuesta = await pedir(cliente, 'retencion:liberar');

      expect(respuesta.ok).toBe(false);
      expect(respuesta.error.codigo).toBe('ERROR_INTERNO');
      silencio.mockRestore();
    });

    it('avisa a los demás cuando una franja se convierte en reserva', async () => {
      const { cliente: luis } = await conectarYEsperarInicio(LUIS);
      const aviso = esperar(luis, 'disponibilidad:reservada');

      await retencionService.convertirEnReserva(ANA, CANCHA, { fecha: FRANJA.fecha, horaInicio: '10:00:00', horaFin: '11:00:00' });

      expect(await aviso).toEqual({ canchaId: CANCHA, ...FRANJA });
    });
  });

  describe('temporizador', () => {
    it('reinicia la sesión y le da un nuevo vencimiento al usuario', async () => {
      const { cliente } = await conectarYEsperarInicio(ANA);
      const nuevoInicio = esperar(cliente, 'temporizador:inicio');

      const respuesta = await pedir(cliente, 'temporizador:reiniciar');

      expect(respuesta.expiresAt).toBeGreaterThan(Date.now() + 170000);
      expect((await nuevoInicio).estado).toBe('activo');
    });

    it('reenvía la sincronización y el vencimiento de la sesión solo a ese usuario', async () => {
      const { cliente: ana } = await conectarYEsperarInicio(ANA);
      const { cliente: luis } = await conectarYEsperarInicio(LUIS);
      const recibidosPorLuis = [];
      luis.on('temporizador:sync', (datos) => recibidosPorLuis.push(datos));
      const sync = esperar(ana, 'temporizador:sync');
      const expirado = esperar(ana, 'temporizador:expirado');

      temporizadorService.eventos.emit('sync', { key: `${ANA}:${CANCHA}`, expiresAt: 123 });
      temporizadorService.eventos.emit('expirado', { key: `${ANA}:${CANCHA}` });

      expect(await sync).toEqual({ expiresAt: 123, ahora: expect.any(Number) });
      await expirado;
      expect(recibidosPorLuis).toHaveLength(0);
    });

    it('responde con el error cuando no se puede reiniciar la sesión', async () => {
      const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { cliente } = await conectarYEsperarInicio(ANA);
      const sesionRepository = require('../src/repositories/sesionReservaRepository');
      sesionRepository.eliminar.mockRejectedValueOnce(new Error('la base se cayó'));

      const respuesta = await pedir(cliente, 'temporizador:reiniciar');

      expect(respuesta.error.codigo).toBe('ERROR_INTERNO');
      silencio.mockRestore();
    });

    it('avisa al cliente si no se pudo iniciar la sesión', async () => {
      const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
      const sesionRepository = require('../src/repositories/sesionReservaRepository');
      sesionRepository.obtener.mockRejectedValueOnce(new Error('la base se cayó'));

      const cliente = conectar(ANA);
      const error = await esperar(cliente, 'temporizador:error');

      expect(error.codigo).toBe('ERROR_INTERNO');
      silencio.mockRestore();
    });
  });
});
