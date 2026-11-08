// US-27: perfil, cambio de contraseña y cambio de correo con verificación. Repositorios y correo simulados.
jest.mock('../src/repositories/usuarioRepository');
jest.mock('../src/repositories/cambioCorreoRepository');
jest.mock('../src/services/emailService', () => ({ enviarCorreoVerificacionCorreo: jest.fn() }));

const bcrypt = require('bcryptjs');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const cambioCorreoRepository = require('../src/repositories/cambioCorreoRepository');
const emailService = require('../src/services/emailService');
const { hashearToken } = require('../src/utils/resetToken');
const perfilService = require('../src/services/perfilService');

const USUARIO = { id: 'usuario-1', nombre: 'Ana Pérez', correo: 'ana@correo.com', telefono: '3001234567', passwordHash: bcrypt.hashSync('Password123!', 4) };

describe('perfilService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    usuarioRepository.buscarPorId.mockResolvedValue(USUARIO);
  });

  describe('obtenerPerfil', () => {
    it('devuelve los datos sin contraseña y sin cambio pendiente', async () => {
      cambioCorreoRepository.buscarPendienteDeUsuario.mockResolvedValue(null);

      const perfil = await perfilService.obtenerPerfil('usuario-1');

      expect(perfil).toEqual({ id: 'usuario-1', nombre: 'Ana Pérez', correo: 'ana@correo.com', telefono: '3001234567', correoPendiente: null });
      expect(JSON.stringify(perfil)).not.toContain('passwordHash');
    });

    it('incluye el correo que espera verificación', async () => {
      cambioCorreoRepository.buscarPendienteDeUsuario.mockResolvedValue({ nuevoCorreo: 'nueva@correo.com' });

      expect((await perfilService.obtenerPerfil('usuario-1')).correoPendiente).toBe('nueva@correo.com');
    });

    it('lanza 404 si el usuario no existe', async () => {
      usuarioRepository.buscarPorId.mockResolvedValue(null);

      await expect(perfilService.obtenerPerfil('x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('actualizarPerfil', () => {
    it('guarda nombre y teléfono y devuelve el perfil actualizado', async () => {
      usuarioRepository.actualizarPerfil.mockResolvedValue({ ...USUARIO, nombre: 'Ana María', telefono: '3109998888' });

      const perfil = await perfilService.actualizarPerfil('usuario-1', { nombre: 'Ana María', telefono: '3109998888' });

      expect(usuarioRepository.actualizarPerfil).toHaveBeenCalledWith('usuario-1', { nombre: 'Ana María', telefono: '3109998888' });
      expect(perfil).toMatchObject({ nombre: 'Ana María', telefono: '3109998888', correo: 'ana@correo.com' });
    });

    it('lanza 404 si el usuario no existe', async () => {
      usuarioRepository.buscarPorId.mockResolvedValue(null);

      await expect(perfilService.actualizarPerfil('x', { nombre: 'A', telefono: '3001234567' })).rejects.toMatchObject({ statusCode: 404 });
      expect(usuarioRepository.actualizarPerfil).not.toHaveBeenCalled();
    });
  });

  describe('cambiarPassword', () => {
    it('con la contraseña actual correcta guarda el hash de la nueva', async () => {
      await perfilService.cambiarPassword('usuario-1', { passwordActual: 'Password123!', nuevaPassword: 'NuevaClave456' });

      const [id, hash] = usuarioRepository.actualizarPassword.mock.calls[0];
      expect(id).toBe('usuario-1');
      expect(hash).not.toBe('NuevaClave456');
      expect(await bcrypt.compare('NuevaClave456', hash)).toBe(true);
    });

    it('rechaza con 400 (no 401) si la actual es incorrecta, y no cambia nada', async () => {
      await expect(perfilService.cambiarPassword('usuario-1', { passwordActual: 'Equivocada1', nuevaPassword: 'NuevaClave456' })).rejects.toMatchObject({
        statusCode: 400,
        codigo: 'PASSWORD_ACTUAL_INCORRECTA',
        errores: [{ campo: 'passwordActual', mensaje: 'La contraseña actual no es correcta' }],
      });
      expect(usuarioRepository.actualizarPassword).not.toHaveBeenCalled();
    });

    it('rechaza una nueva contraseña igual a la actual', async () => {
      await expect(perfilService.cambiarPassword('usuario-1', { passwordActual: 'Password123!', nuevaPassword: 'Password123!' })).rejects.toMatchObject({
        statusCode: 400,
        codigo: 'PASSWORD_REPETIDA',
      });
      expect(usuarioRepository.actualizarPassword).not.toHaveBeenCalled();
    });
  });

  describe('solicitarCambioCorreo', () => {
    const solicitud = { nuevoCorreo: 'Nueva@Correo.com ', urlBaseFrontend: 'http://localhost:5173' };

    beforeEach(() => {
      usuarioRepository.buscarPorCorreo.mockResolvedValue(null);
      cambioCorreoRepository.crear.mockResolvedValue({});
      emailService.enviarCorreoVerificacionCorreo.mockResolvedValue({ simulado: true });
    });

    it('NO cambia el correo: guarda el hash del token y envía el enlace al correo nuevo', async () => {
      await perfilService.solicitarCambioCorreo('usuario-1', solicitud);

      expect(usuarioRepository.actualizarCorreo).not.toHaveBeenCalled();
      expect(cambioCorreoRepository.invalidarPendientesDeUsuario).toHaveBeenCalledWith('usuario-1');

      const { usuarioId, nuevoCorreo, tokenHash, expiresAt } = cambioCorreoRepository.crear.mock.calls[0][0];
      expect(usuarioId).toBe('usuario-1');
      expect(nuevoCorreo).toBe('nueva@correo.com');
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      const { para, enlaceVerificacion } = emailService.enviarCorreoVerificacionCorreo.mock.calls[0][0];
      expect(para).toBe('nueva@correo.com');
      const token = new URL(enlaceVerificacion).searchParams.get('token');
      expect(enlaceVerificacion).toMatch(/^http:\/\/localhost:5173\/verificar-correo\?token=/);
      expect(tokenHash).toBe(hashearToken(token));
      expect(tokenHash).not.toBe(token);
    });

    it('rechaza un correo igual al actual', async () => {
      await expect(perfilService.solicitarCambioCorreo('usuario-1', { ...solicitud, nuevoCorreo: 'ANA@correo.com' })).rejects.toMatchObject({ statusCode: 400, codigo: 'CORREO_SIN_CAMBIO' });
      expect(emailService.enviarCorreoVerificacionCorreo).not.toHaveBeenCalled();
    });

    it('rechaza con 409 un correo que ya usa otra cuenta', async () => {
      usuarioRepository.buscarPorCorreo.mockResolvedValue({ id: 'otro' });

      await expect(perfilService.solicitarCambioCorreo('usuario-1', solicitud)).rejects.toMatchObject({ statusCode: 409, codigo: 'CORREO_DUPLICADO' });
      expect(cambioCorreoRepository.crear).not.toHaveBeenCalled();
    });
  });

  describe('confirmarCambioCorreo', () => {
    const registro = { id: 'cambio-1', usuarioId: 'usuario-1', nuevoCorreo: 'nueva@correo.com' };

    it('aplica el cambio y marca el enlace como usado', async () => {
      cambioCorreoRepository.buscarValidoPorHash.mockResolvedValue(registro);
      usuarioRepository.buscarPorCorreo.mockResolvedValue(null);

      const resultado = await perfilService.confirmarCambioCorreo({ token: 'token-del-enlace' });

      expect(cambioCorreoRepository.buscarValidoPorHash).toHaveBeenCalledWith(hashearToken('token-del-enlace'));
      expect(usuarioRepository.actualizarCorreo).toHaveBeenCalledWith('usuario-1', 'nueva@correo.com');
      expect(cambioCorreoRepository.marcarUsado).toHaveBeenCalledWith('cambio-1');
      expect(resultado).toEqual({ correo: 'nueva@correo.com' });
    });

    it('rechaza un enlace inválido, usado o vencido', async () => {
      cambioCorreoRepository.buscarValidoPorHash.mockResolvedValue(null);

      await expect(perfilService.confirmarCambioCorreo({ token: 'malo' })).rejects.toMatchObject({ statusCode: 400 });
      expect(usuarioRepository.actualizarCorreo).not.toHaveBeenCalled();
    });

    it('si otra cuenta registró ese correo mientras tanto, responde 409 y consume el enlace', async () => {
      cambioCorreoRepository.buscarValidoPorHash.mockResolvedValue(registro);
      usuarioRepository.buscarPorCorreo.mockResolvedValue({ id: 'otro-usuario' });

      await expect(perfilService.confirmarCambioCorreo({ token: 't' })).rejects.toMatchObject({ statusCode: 409, codigo: 'CORREO_DUPLICADO' });
      expect(cambioCorreoRepository.marcarUsado).toHaveBeenCalledWith('cambio-1');
      expect(usuarioRepository.actualizarCorreo).not.toHaveBeenCalled();
    });

    it('convierte la violación del índice único de Postgres en un 409', async () => {
      cambioCorreoRepository.buscarValidoPorHash.mockResolvedValue(registro);
      usuarioRepository.buscarPorCorreo.mockResolvedValue(null);
      usuarioRepository.actualizarCorreo.mockRejectedValue(Object.assign(new Error('duplicado'), { code: '23505' }));

      await expect(perfilService.confirmarCambioCorreo({ token: 't' })).rejects.toMatchObject({ statusCode: 409 });
    });

    it('propaga cualquier otro error de la base', async () => {
      const falla = new Error('la base se cayó');
      cambioCorreoRepository.buscarValidoPorHash.mockResolvedValue(registro);
      usuarioRepository.buscarPorCorreo.mockResolvedValue(null);
      usuarioRepository.actualizarCorreo.mockRejectedValue(falla);

      await expect(perfilService.confirmarCambioCorreo({ token: 't' })).rejects.toBe(falla);
    });
  });
});
