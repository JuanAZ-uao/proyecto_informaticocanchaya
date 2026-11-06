// US-29: verificación del código de reserva por el administrador. Repositorios simulados.
jest.mock('../src/repositories/reservaRepository');
jest.mock('../src/repositories/verificacionRepository');

const reservaRepository = require('../src/repositories/reservaRepository');
const verificacionRepository = require('../src/repositories/verificacionRepository');
const servicio = require('../src/services/verificacionReservaService');

const ADMIN = 'admin-1';
const CODIGO = 'CY-D1AD1C79';

// Fila tal como la devuelve reservaRepository.buscarPorCodigo.
const fila = (extra = {}) => ({
  id: 'reserva-1',
  codigo: CODIGO,
  estado: 'confirmada',
  usada_at: null,
  vencida: false,
  fecha_texto: '2099-12-31',
  hora_inicio_texto: '10:00',
  hora_fin_texto: '11:00',
  cancha_nombre: 'Cancha El Bosque',
  cancha_direccion: 'Av. Roosevelt # 30-10, Cali',
  usuario_nombre: 'Ana Pérez',
  ...extra,
});

const auditoria = () => verificacionRepository.registrar.mock.calls.map(([datos]) => datos);

describe('verificacionReservaService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    verificacionRepository.registrar.mockResolvedValue(undefined);
  });

  describe('verificarCodigo', () => {
    it('una reserva confirmada que no ha vencido es "vigente", con cancha, fecha, horario y nombre del usuario', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila());

      const resultado = await servicio.verificarCodigo(ADMIN, CODIGO);

      expect(resultado).toEqual({
        estado: 'vigente',
        motivo: null,
        reserva: {
          id: 'reserva-1',
          codigo: CODIGO,
          cancha: { nombre: 'Cancha El Bosque', direccion: 'Av. Roosevelt # 30-10, Cali' },
          fecha: '2099-12-31',
          horaInicio: '10:00',
          horaFin: '11:00',
          usuario: { nombre: 'Ana Pérez' },
          usadaAt: null,
        },
      });
      expect(auditoria()).toEqual([{ administradorId: ADMIN, codigo: CODIGO, resultado: 'vigente', reservaId: 'reserva-1' }]);
    });

    it('no revela el correo ni el teléfono del usuario', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila({ usuario_correo: 'ana@correo.com', usuario_telefono: '3001234567' }));

      const texto = JSON.stringify(await servicio.verificarCodigo(ADMIN, CODIGO));

      expect(texto).not.toContain('ana@correo.com');
      expect(texto).not.toContain('3001234567');
    });

    it.each([
      ['cancelada', { estado: 'cancelada' }],
      ['usada', { usada_at: new Date('2099-12-31T10:00:00Z') }],
      ['vencida', { vencida: true }],
    ])('una reserva %s es "no vigente" y dice el motivo', async (motivo, extra) => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila(extra));

      const resultado = await servicio.verificarCodigo(ADMIN, CODIGO);

      expect(resultado).toMatchObject({ estado: 'no_vigente', motivo });
      expect(auditoria()[0].resultado).toBe(motivo);
    });

    it('si se cumplen varios motivos prevalece: cancelada, luego usada, luego vencida', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila({ estado: 'cancelada', usada_at: new Date(), vencida: true }));
      expect((await servicio.verificarCodigo(ADMIN, CODIGO)).motivo).toBe('cancelada');

      reservaRepository.buscarPorCodigo.mockResolvedValue(fila({ usada_at: new Date(), vencida: true }));
      expect((await servicio.verificarCodigo(ADMIN, CODIGO)).motivo).toBe('usada');
    });

    it('acepta el código en minúsculas y con espacios', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila());

      await servicio.verificarCodigo(ADMIN, '  cy-d1ad1c79 ');

      expect(reservaRepository.buscarPorCodigo).toHaveBeenCalledWith(CODIGO);
    });

    it.each([['CY-XXXXXXXX'], ['D1AD1C79'], ['CY-D1AD1C7'], ['CY-D1AD1C79-EXTRA'], [''], [undefined], ["' OR 1=1 --"]])(
      'el código con formato inválido %p responde "Código no encontrado" sin consultar la base',
      async (codigo) => {
        await expect(servicio.verificarCodigo(ADMIN, codigo)).rejects.toMatchObject({ statusCode: 404, message: 'Código no encontrado', codigo: 'CODIGO_NO_ENCONTRADO' });

        expect(reservaRepository.buscarPorCodigo).not.toHaveBeenCalled();
        expect(auditoria()[0].resultado).toBe('no_encontrado');
      }
    );

    it('un código con formato válido pero inexistente responde igual, sin datos de otras reservas', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(null);

      await expect(servicio.verificarCodigo(ADMIN, 'CY-00000000')).rejects.toMatchObject({ statusCode: 404, message: 'Código no encontrado' });
      expect(auditoria()).toEqual([{ administradorId: ADMIN, codigo: 'CY-00000000', resultado: 'no_encontrado', reservaId: null }]);
    });

    it('en la auditoría el código escrito se acota y se limpian los caracteres de control', async () => {
      await expect(servicio.verificarCodigo(ADMIN, `ab\ncd\t${'x'.repeat(100)}`)).rejects.toMatchObject({ statusCode: 404 });

      const { codigo } = auditoria()[0];
      expect(codigo).toHaveLength(40);
      expect(codigo).not.toMatch(/[\n\t]/);
      expect(codigo.startsWith('AB CD ')).toBe(true);
    });

    it('si no se puede registrar la auditoría, la verificación falla (no queda sin registro)', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila());
      verificacionRepository.registrar.mockRejectedValue(new Error('la base se cayó'));

      await expect(servicio.verificarCodigo(ADMIN, CODIGO)).rejects.toThrow('la base se cayó');
    });
  });

  describe('marcarComoUsada', () => {
    it('marca una reserva vigente como utilizada y lo registra', async () => {
      const usadaAt = new Date('2099-12-31T15:00:00Z');
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila());
      reservaRepository.marcarUsada.mockResolvedValue({ usada_at: usadaAt });

      const resultado = await servicio.marcarComoUsada(ADMIN, CODIGO);

      expect(reservaRepository.marcarUsada).toHaveBeenCalledWith('reserva-1', ADMIN);
      expect(resultado).toMatchObject({ estado: 'no_vigente', motivo: 'usada', reserva: { codigo: CODIGO, usadaAt } });
      expect(auditoria()).toEqual([{ administradorId: ADMIN, codigo: CODIGO, resultado: 'marcada_usada', reservaId: 'reserva-1' }]);
    });

    it.each([
      ['cancelada', { estado: 'cancelada' }],
      ['usada', { usada_at: new Date() }],
      ['vencida', { vencida: true }],
    ])('rechaza con 409 una reserva %s, sin marcarla', async (motivo, extra) => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila(extra));

      await expect(servicio.marcarComoUsada(ADMIN, CODIGO)).rejects.toMatchObject({ statusCode: 409, codigo: 'RESERVA_NO_VIGENTE', message: expect.stringContaining(motivo) });
      expect(reservaRepository.marcarUsada).not.toHaveBeenCalled();
      expect(auditoria()[0].resultado).toBe(motivo);
    });

    it('si otro administrador la marcó justo antes, responde 409', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(fila());
      reservaRepository.marcarUsada.mockResolvedValue(null);

      await expect(servicio.marcarComoUsada(ADMIN, CODIGO)).rejects.toMatchObject({ statusCode: 409, codigo: 'RESERVA_NO_VIGENTE' });
      expect(auditoria()[0].resultado).toBe('usada');
    });

    it('un código inexistente responde 404', async () => {
      reservaRepository.buscarPorCodigo.mockResolvedValue(null);

      await expect(servicio.marcarComoUsada(ADMIN, 'CY-00000000')).rejects.toMatchObject({ statusCode: 404 });
      expect(reservaRepository.marcarUsada).not.toHaveBeenCalled();
    });
  });

  describe('listarVerificaciones', () => {
    it('devuelve las últimas verificaciones del repositorio', async () => {
      verificacionRepository.listarRecientes.mockResolvedValue([{ id: 'v1' }]);

      expect(await servicio.listarVerificaciones(10)).toEqual([{ id: 'v1' }]);
      expect(verificacionRepository.listarRecientes).toHaveBeenCalledWith(10);
    });
  });
});
