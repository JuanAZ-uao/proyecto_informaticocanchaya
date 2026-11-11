// US-15: gestión de canchas por un administrador. Pruebas con repositorios simulados (no necesitan base de datos).

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://sin:uso@localhost:5432/sin_uso';
jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn(), on: jest.fn() }));
jest.mock('../src/repositories/canchaRepository');
jest.mock('../src/repositories/horarioRepository');
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/pagoRepository');
jest.mock('../src/repositories/sesionReservaRepository');
jest.mock('../src/repositories/usuarioRepository', () => ({ buscarPorId: jest.fn() }));
jest.mock('../src/services/retencionService', () => ({
  verificarDisponibleParaReservar: jest.fn(),
  convertirEnReserva: jest.fn(),
  notificarFranjaLiberada: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const { generarToken } = require('../src/utils/jwt');
const canchaRepository = require('../src/repositories/canchaRepository');
const horarioRepository = require('../src/repositories/horarioRepository');
const reservaRepository = require('../src/repositories/reservaRepository');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const canchaService = require('../src/services/canchaService');
const reservaService = require('../src/services/reservaService');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const CANCHA_ID = '33333333-3333-4333-8333-333333333333';

const horariosValidos = [
  { diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' },
  { diaSemana: 6, horaInicio: '07:00', horaFin: '20:00' },
];
const cuerpoValido = (extra = {}) => ({
  nombre: '  Cancha Nueva  ',
  direccion: 'Calle 10 # 5-20, Cali',
  zona: 'Sur',
  costoHora: 80000,
  tipo: 'Fútbol 7',
  descripcion: 'Cancha sintética con iluminación.',
  servicios: ['Parqueadero', 'Iluminación LED'],
  horarios: horariosValidos,
  ...extra,
});

const canchaDominio = (extra = {}) => ({
  id: CANCHA_ID,
  nombre: 'Cancha Nueva',
  direccion: 'Calle 10 # 5-20, Cali',
  zona: 'Sur',
  costoHora: 80000,
  tipo: 'Fútbol 7',
  descripcion: 'Cancha sintética con iluminación.',
  servicios: ['Parqueadero'],
  imagenUrl: null,
  disponible: true,
  reservasFuturas: 0,
  ...extra,
});

const tokenAdmin = generarToken({ sub: ADMIN_ID });
const tokenUsuario = generarToken({ sub: USUARIO_ID });
const admin = (peticion) => peticion.set('Authorization', `Bearer ${tokenAdmin}`);

describe('Rutas /api/admin/canchas (US-15)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    usuarioRepository.buscarPorId.mockImplementation(async (id) => ({ id, rol: id === ADMIN_ID ? 'administrador' : 'usuario' }));
    horarioRepository.listarPorCancha.mockResolvedValue([{ diaSemana: 1, horaInicio: '06:00:00', horaFin: '22:00:00' }]);
  });

  describe('acceso', () => {
    it.each([
      ['GET', '/api/admin/canchas'],
      ['POST', '/api/admin/canchas'],
      ['PUT', `/api/admin/canchas/${CANCHA_ID}`],
      ['PATCH', `/api/admin/canchas/${CANCHA_ID}/desactivar`],
      ['PATCH', `/api/admin/canchas/${CANCHA_ID}/activar`],
    ])('%s %s responde 403 a un usuario sin rol de administrador y 401 sin sesión', async (metodo, ruta) => {
      const comoUsuario = await request(app)[metodo.toLowerCase()](ruta).set('Authorization', `Bearer ${tokenUsuario}`).send(cuerpoValido());
      expect(comoUsuario.status).toBe(403);

      const sinSesion = await request(app)[metodo.toLowerCase()](ruta).send(cuerpoValido());
      expect(sinSesion.status).toBe(401);

      expect(canchaRepository.crearConHorarios).not.toHaveBeenCalled();
      expect(canchaRepository.actualizarConHorarios).not.toHaveBeenCalled();
      expect(canchaRepository.cambiarDisponibilidad).not.toHaveBeenCalled();
    });
  });

  describe('crear', () => {
    it('crea la cancha con sus horarios, normaliza los textos y responde 201', async () => {
      canchaRepository.crearConHorarios.mockResolvedValue({ id: CANCHA_ID });
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio());

      const respuesta = await admin(request(app).post('/api/admin/canchas')).send(cuerpoValido());

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.cancha).toMatchObject({ id: CANCHA_ID, disponible: true, horarios: [{ diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' }] });
      expect(canchaRepository.crearConHorarios).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Cancha Nueva', direccion: 'Calle 10 # 5-20, Cali', costoHora: 80000, tipo: 'Fútbol 7', servicios: ['Parqueadero', 'Iluminación LED'] }),
        horariosValidos
      );
    });

    it('no deja pasar columnas internas enviadas en el cuerpo (por ejemplo, disponible)', async () => {
      canchaRepository.crearConHorarios.mockResolvedValue({ id: CANCHA_ID });
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio());

      await admin(request(app).post('/api/admin/canchas')).send(cuerpoValido({ disponible: false, id: 'x', createdAt: 'x' }));

      const [datos] = canchaRepository.crearConHorarios.mock.calls[0];
      expect(Object.keys(datos).sort()).toEqual(['costoHora', 'descripcion', 'direccion', 'nombre', 'servicios', 'tipo', 'zona']);
    });

    it.each([
      ['nombre vacío', { nombre: '  ' }, 'nombre'],
      ['dirección vacía', { direccion: '' }, 'direccion'],
      ['precio 0', { costoHora: 0 }, 'costoHora'],
      ['precio negativo', { costoHora: -5000 }, 'costoHora'],
      ['precio que no es número', { costoHora: 'barato' }, 'costoHora'],
      ['tipo desconocido', { tipo: 'Fútbol 3' }, 'tipo'],
      ['sin horarios', { horarios: [] }, 'horarios'],
      ['cierre antes de la apertura', { horarios: [{ diaSemana: 1, horaInicio: '20:00', horaFin: '08:00' }] }, 'horarios'],
      ['cierre igual a la apertura', { horarios: [{ diaSemana: 1, horaInicio: '10:00', horaFin: '10:00' }] }, 'horarios'],
      ['hora con formato inválido', { horarios: [{ diaSemana: 1, horaInicio: '25:00', horaFin: '26:00' }] }, 'horarios'],
      ['día fuera de rango', { horarios: [{ diaSemana: 7, horaInicio: '08:00', horaFin: '10:00' }] }, 'horarios'],
      ['día repetido', { horarios: [{ diaSemana: 1, horaInicio: '08:00', horaFin: '10:00' }, { diaSemana: 1, horaInicio: '12:00', horaFin: '14:00' }] }, 'horarios'],
    ])('rechaza %s con un error en el campo "%s" y no guarda nada', async (_nombre, extra, campo) => {
      const respuesta = await admin(request(app).post('/api/admin/canchas')).send(cuerpoValido(extra));

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errores.map((e) => e.campo)).toContain(campo);
      expect(canchaRepository.crearConHorarios).not.toHaveBeenCalled();
    });

    it('con el cuerpo vacío señala todos los campos obligatorios', async () => {
      const respuesta = await admin(request(app).post('/api/admin/canchas')).send({});

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errores.map((e) => e.campo)).toEqual(expect.arrayContaining(['nombre', 'direccion', 'costoHora', 'horarios']));
    });
  });

  describe('editar', () => {
    it('actualiza los datos y reemplaza los horarios', async () => {
      canchaRepository.actualizarConHorarios.mockResolvedValue({ id: CANCHA_ID });
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio({ costoHora: 90000 }));

      const respuesta = await admin(request(app).put(`/api/admin/canchas/${CANCHA_ID}`)).send(cuerpoValido({ costoHora: 90000 }));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.cancha.costoHora).toBe(90000);
      expect(canchaRepository.actualizarConHorarios).toHaveBeenCalledWith(CANCHA_ID, expect.objectContaining({ costoHora: 90000 }), horariosValidos);
      // las reservas ya confirmadas no se tocan: la edición nunca invoca al repositorio de reservas
      expect(reservaRepository.cancelar).not.toHaveBeenCalled();
      expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
    });

    it('responde 404 si la cancha no existe y 400 si el id no es válido o los datos no lo son', async () => {
      canchaRepository.actualizarConHorarios.mockResolvedValue(null);

      expect((await admin(request(app).put(`/api/admin/canchas/${CANCHA_ID}`)).send(cuerpoValido())).status).toBe(404);
      expect((await admin(request(app).put('/api/admin/canchas/no-es-uuid')).send(cuerpoValido())).status).toBe(400);
      expect((await admin(request(app).put(`/api/admin/canchas/${CANCHA_ID}`)).send(cuerpoValido({ costoHora: 0 }))).status).toBe(400);
    });
  });

  describe('desactivar', () => {
    it('una cancha sin reservas futuras se desactiva de inmediato', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio({ reservasFuturas: 0 }));
      canchaRepository.cambiarDisponibilidad.mockResolvedValue(canchaDominio({ disponible: false }));

      const respuesta = await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/desactivar`)).send({});

      expect(respuesta.status).toBe(200);
      expect(canchaRepository.cambiarDisponibilidad).toHaveBeenCalledWith(CANCHA_ID, false);
    });

    it('con reservas futuras advierte de las afectadas (409) y NO desactiva hasta que se confirme', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio({ reservasFuturas: 2 }));
      reservaRepository.listarFuturasConfirmadasDeCancha.mockResolvedValue([
        { id: 'r1', codigo: 'CY-AAAAAAAA', usuarioNombre: 'Ana', fecha: '2099-01-01', horaInicio: '10:00', horaFin: '11:00' },
        { id: 'r2', codigo: 'CY-BBBBBBBB', usuarioNombre: 'Luis', fecha: '2099-01-02', horaInicio: '12:00', horaFin: '13:00' },
      ]);

      const respuesta = await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/desactivar`)).send({});

      expect(respuesta.status).toBe(409);
      expect(respuesta.body).toMatchObject({ codigo: 'CONFIRMACION_REQUERIDA', reservasAfectadas: 2 });
      expect(respuesta.body.reservas).toHaveLength(2);
      expect(canchaRepository.cambiarDisponibilidad).not.toHaveBeenCalled();
    });

    it('con confirmación explícita la desactiva y conserva las reservas', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValue(canchaDominio({ reservasFuturas: 2 }));
      canchaRepository.cambiarDisponibilidad.mockResolvedValue(canchaDominio({ disponible: false }));

      const respuesta = await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/desactivar`)).send({ confirmar: true });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.reservasAfectadas).toBe(2);
      expect(canchaRepository.cambiarDisponibilidad).toHaveBeenCalledWith(CANCHA_ID, false);
      expect(reservaRepository.cancelarAdministrativamente).not.toHaveBeenCalled();
    });

    it('una cancha ya desactivada o inexistente responde 409 y 404', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValueOnce(canchaDominio({ disponible: false }));
      expect((await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/desactivar`)).send({})).status).toBe(409);

      canchaRepository.obtenerParaAdmin.mockResolvedValueOnce(null);
      expect((await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/desactivar`)).send({})).status).toBe(404);
    });
  });

  describe('activar y consultar', () => {
    it('reactiva una cancha desactivada y rechaza reactivar una activa', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValueOnce(canchaDominio({ disponible: false })).mockResolvedValue(canchaDominio());
      canchaRepository.cambiarDisponibilidad.mockResolvedValue(canchaDominio());

      expect((await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/activar`))).status).toBe(200);
      expect(canchaRepository.cambiarDisponibilidad).toHaveBeenCalledWith(CANCHA_ID, true);
      expect((await admin(request(app).patch(`/api/admin/canchas/${CANCHA_ID}/activar`))).status).toBe(409);
    });

    it('lista todas las canchas (también las desactivadas) con el número de reservas futuras', async () => {
      canchaRepository.listarTodasParaAdmin.mockResolvedValue([canchaDominio({ reservasFuturas: 3 }), canchaDominio({ id: 'otra', disponible: false })]);

      const respuesta = await admin(request(app).get('/api/admin/canchas'));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.canchas.map((c) => [c.disponible, c.reservasFuturas])).toEqual([[true, 3], [false, 0]]);
    });

    it('obtiene una cancha con sus horarios, y 404 si no existe', async () => {
      canchaRepository.obtenerParaAdmin.mockResolvedValueOnce(canchaDominio());
      const ok = await admin(request(app).get(`/api/admin/canchas/${CANCHA_ID}`));
      expect(ok.status).toBe(200);
      expect(ok.body.cancha.horarios).toEqual([{ diaSemana: 1, horaInicio: '06:00', horaFin: '22:00' }]);

      canchaRepository.obtenerParaAdmin.mockResolvedValueOnce(null);
      expect((await admin(request(app).get(`/api/admin/canchas/${CANCHA_ID}`))).status).toBe(404);
    });
  });
});

describe('Una cancha desactivada para el público (US-15)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('no admite nuevas reservas: 409 CANCHA_NO_DISPONIBLE y no se crea nada', async () => {
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cerrada', disponible: false });

    await expect(
      reservaService.crearReserva({ canchaId: CANCHA_ID, usuarioId: USUARIO_ID, fecha: '2099-01-05', horaInicio: '10:00', horaFin: '11:00' })
    ).rejects.toMatchObject({ statusCode: 409, codigo: 'CANCHA_NO_DISPONIBLE' });
    expect(reservaRepository.crear).not.toHaveBeenCalled();
  });

  it('su detalle público responde 404', async () => {
    canchaRepository.obtenerPorId.mockResolvedValue({ id: CANCHA_ID, nombre: 'Cerrada', disponible: false });

    await expect(canchaService.obtenerDetalleCancha(CANCHA_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el listado público solo consulta las disponibles', async () => {
    canchaRepository.listarDisponibles.mockResolvedValue([]);

    await canchaService.listarCanchasDisponibles({});

    expect(canchaRepository.listarDisponibles).toHaveBeenCalled();
    expect(canchaRepository.listarTodasParaAdmin).not.toHaveBeenCalled();
  });
});
