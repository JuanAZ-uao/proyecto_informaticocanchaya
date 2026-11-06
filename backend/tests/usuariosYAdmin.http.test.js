// US-27, US-28 y US-29 a nivel HTTP: autenticación, propiedad (403), validación por campo, HTTPS y rol de
// administrador. Los servicios y la base de datos están simulados: aquí se prueba el enrutamiento y los
// validadores, no la lógica de negocio (que tiene sus propias pruebas).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/sin_uso';

jest.mock('../src/config/db', () => ({ query: jest.fn(), connect: jest.fn(), on: jest.fn() }));
jest.mock('../src/repositories/usuarioRepository');
jest.mock('../src/services/perfilService', () => ({
  obtenerPerfil: jest.fn(),
  actualizarPerfil: jest.fn(),
  cambiarPassword: jest.fn(),
  solicitarCambioCorreo: jest.fn(),
  confirmarCambioCorreo: jest.fn(),
}));
jest.mock('../src/services/metodoPagoService', () => ({
  listarMetodosDePago: jest.fn(),
  agregarMetodoDePago: jest.fn(),
  eliminarMetodoDePago: jest.fn(),
  obtenerParaPagar: jest.fn(),
}));
jest.mock('../src/services/verificacionReservaService', () => ({
  verificarCodigo: jest.fn(),
  marcarComoUsada: jest.fn(),
  listarVerificaciones: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const perfilService = require('../src/services/perfilService');
const metodoPagoService = require('../src/services/metodoPagoService');
const verificacionReservaService = require('../src/services/verificacionReservaService');
const ErrorDeAplicacion = require('../src/utils/ErrorDeAplicacion');
const { generarToken } = require('../src/utils/jwt');

const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';
const METODO = '33333333-3333-4333-8333-333333333333';
const tokenAna = generarToken({ sub: ANA });
const con = (peticion, token = tokenAna) => peticion.set('Authorization', `Bearer ${token}`);

const tarjetaValida = { numero: '4242424242424242', titular: 'Ana Pérez', vencimientoMes: 12, vencimientoAnio: 2030, cvv: '123' };

describe('rutas de usuario: autenticación y propiedad', () => {
  beforeEach(() => jest.clearAllMocks());

  const rutas = [
    ['get', `/api/usuarios/${ANA}`],
    ['patch', `/api/usuarios/${ANA}`],
    ['patch', `/api/usuarios/${ANA}/password`],
    ['post', `/api/usuarios/${ANA}/correo`],
    ['get', `/api/usuarios/${ANA}/metodos-pago`],
    ['post', `/api/usuarios/${ANA}/metodos-pago`],
    ['delete', `/api/usuarios/${ANA}/metodos-pago/${METODO}`],
  ];

  it.each(rutas)('%s %s sin token responde 401', async (metodo, ruta) => {
    const respuesta = await request(app)[metodo](ruta);
    expect(respuesta.status).toBe(401);
  });

  it.each(rutas)('%s %s sobre otro usuario responde 403 y no toca nada', async (metodo, ruta) => {
    const ajena = ruta.replace(ANA, LUIS);
    const respuesta = await con(request(app)[metodo](ajena).send({}));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.mensaje).toBe('No tienes permiso para acceder a los datos de otro usuario');
    [perfilService, metodoPagoService].forEach((servicio) => Object.values(servicio).forEach((fn) => expect(fn).not.toHaveBeenCalled()));
  });
});

describe('perfil (US-27)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET devuelve el perfil propio', async () => {
    perfilService.obtenerPerfil.mockResolvedValue({ id: ANA, nombre: 'Ana', correo: 'ana@correo.com', telefono: '3001234567', correoPendiente: null });

    const respuesta = await con(request(app).get(`/api/usuarios/${ANA}`));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuario).toMatchObject({ nombre: 'Ana', correo: 'ana@correo.com' });
    expect(perfilService.obtenerPerfil).toHaveBeenCalledWith(ANA);
  });

  it('PATCH guarda nombre y teléfono, quitando espacios, guiones y paréntesis del teléfono', async () => {
    perfilService.actualizarPerfil.mockResolvedValue({ id: ANA, nombre: 'Ana María', telefono: '+573001234567' });

    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}`).send({ nombre: '  Ana María ', telefono: '+57 (300) 123-4567' }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.mensaje).toBe('Perfil actualizado correctamente');
    expect(perfilService.actualizarPerfil).toHaveBeenCalledWith(ANA, { nombre: 'Ana María', telefono: '+573001234567' });
  });

  it.each([['abc'], ['123'], ['12345678901234567'], ['300-12x-4567']])('PATCH rechaza el teléfono inválido "%s" con el error del campo', async (telefono) => {
    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}`).send({ nombre: 'Ana', telefono }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([{ campo: 'telefono', mensaje: 'El teléfono no es válido (de 7 a 15 dígitos, puede iniciar con +)' }]);
    expect(perfilService.actualizarPerfil).not.toHaveBeenCalled();
  });

  it('PATCH informa un error por cada campo obligatorio vacío', async () => {
    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}`).send({ nombre: '  ', telefono: '' }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual(
      expect.arrayContaining([
        { campo: 'nombre', mensaje: 'El nombre es obligatorio' },
        { campo: 'telefono', mensaje: 'El teléfono es obligatorio' },
      ])
    );
    expect(perfilService.actualizarPerfil).not.toHaveBeenCalled();
  });

  it('PATCH rechaza un nombre de más de 100 caracteres', async () => {
    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}`).send({ nombre: 'x'.repeat(101), telefono: '3001234567' }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores[0].campo).toBe('nombre');
  });

  it('PUT del cambio de contraseña valida la política de la nueva y exige la actual', async () => {
    const debil = await con(request(app).patch(`/api/usuarios/${ANA}/password`).send({ passwordActual: 'Password123!', nuevaPassword: 'corta' }));
    expect(debil.status).toBe(400);
    expect(debil.body.errores).toEqual([{ campo: 'nuevaPassword', mensaje: 'La contraseña debe tener mínimo 8 caracteres, incluyendo una letra y un número' }]);

    const sinActual = await con(request(app).patch(`/api/usuarios/${ANA}/password`).send({ nuevaPassword: 'NuevaClave456' }));
    expect(sinActual.status).toBe(400);
    expect(sinActual.body.errores).toEqual([{ campo: 'passwordActual', mensaje: 'La contraseña actual es obligatoria' }]);
    expect(perfilService.cambiarPassword).not.toHaveBeenCalled();
  });

  it('cambia la contraseña con datos válidos', async () => {
    perfilService.cambiarPassword.mockResolvedValue(undefined);

    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}/password`).send({ passwordActual: 'Password123!', nuevaPassword: 'NuevaClave456' }));

    expect(respuesta.status).toBe(200);
    expect(perfilService.cambiarPassword).toHaveBeenCalledWith(ANA, { passwordActual: 'Password123!', nuevaPassword: 'NuevaClave456' });
  });

  it('si la contraseña actual es incorrecta responde 400 (nunca 401) con el error del campo', async () => {
    perfilService.cambiarPassword.mockRejectedValue(
      new ErrorDeAplicacion('La contraseña actual no es correcta', 400, 'PASSWORD_ACTUAL_INCORRECTA', [{ campo: 'passwordActual', mensaje: 'La contraseña actual no es correcta' }])
    );

    const respuesta = await con(request(app).patch(`/api/usuarios/${ANA}/password`).send({ passwordActual: 'Mala12345', nuevaPassword: 'NuevaClave456' }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({
      mensaje: 'La contraseña actual no es correcta',
      codigo: 'PASSWORD_ACTUAL_INCORRECTA',
      errores: [{ campo: 'passwordActual', mensaje: 'La contraseña actual no es correcta' }],
    });
  });

  it('POST del correo exige un correo válido y responde 202 sin cambiarlo todavía', async () => {
    const invalido = await con(request(app).post(`/api/usuarios/${ANA}/correo`).send({ nuevoCorreo: 'no-es-correo' }));
    expect(invalido.status).toBe(400);

    perfilService.solicitarCambioCorreo.mockResolvedValue(undefined);
    const valido = await con(request(app).post(`/api/usuarios/${ANA}/correo`).set('Origin', 'http://localhost:5173').send({ nuevoCorreo: 'nueva@correo.com' }));

    expect(valido.status).toBe(202);
    expect(valido.body.mensaje).toContain('nueva@correo.com');
    expect(perfilService.solicitarCambioCorreo).toHaveBeenCalledWith(ANA, { nuevoCorreo: 'nueva@correo.com', urlBaseFrontend: 'http://localhost:5173' });
  });

  it('POST /api/auth/verificar-correo es público y confirma el cambio', async () => {
    perfilService.confirmarCambioCorreo.mockResolvedValue({ correo: 'nueva@correo.com' });

    const sinToken = await request(app).post('/api/auth/verificar-correo').send({});
    expect(sinToken.status).toBe(400);

    const respuesta = await request(app).post('/api/auth/verificar-correo').send({ token: 'abc' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ mensaje: 'Correo actualizado correctamente', correo: 'nueva@correo.com' });
  });

  it('traduce los errores de negocio (409 correo duplicado)', async () => {
    perfilService.solicitarCambioCorreo.mockRejectedValue(new ErrorDeAplicacion('El correo ya está registrado', 409, 'CORREO_DUPLICADO'));

    const respuesta = await con(request(app).post(`/api/usuarios/${ANA}/correo`).send({ nuevoCorreo: 'otra@correo.com' }));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.codigo).toBe('CORREO_DUPLICADO');
  });
});

describe('métodos de pago (US-28)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET lista las tarjetas enmascaradas del propietario', async () => {
    metodoPagoService.listarMetodosDePago.mockResolvedValue([{ id: METODO, marca: 'Visa', ultimos4: '4242', titular: 'ANA', vencimiento: '12/30' }]);

    const respuesta = await con(request(app).get(`/api/usuarios/${ANA}/metodos-pago`));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.metodosPago).toEqual([expect.objectContaining({ marca: 'Visa', ultimos4: '4242' })]);
    expect(metodoPagoService.listarMetodosDePago).toHaveBeenCalledWith(ANA);
  });

  it('POST guarda la tarjeta y la respuesta nunca contiene el número, el CVV ni el token', async () => {
    metodoPagoService.agregarMetodoDePago.mockResolvedValue({ id: METODO, marca: 'Visa', ultimos4: '4242', titular: 'Ana Pérez', vencimiento: '12/30' });

    const respuesta = await con(request(app).post(`/api/usuarios/${ANA}/metodos-pago`).send(tarjetaValida));

    expect(respuesta.status).toBe(201);
    const texto = JSON.stringify(respuesta.body);
    expect(texto).not.toContain('4242424242424242');
    expect(texto).not.toContain('"cvv"');
    expect(texto).not.toContain('token');
    expect(respuesta.body.metodoPago).toMatchObject({ marca: 'Visa', ultimos4: '4242' });
    expect(metodoPagoService.agregarMetodoDePago).toHaveBeenCalledWith(ANA, tarjetaValida);
  });

  it('POST informa el error de cada campo faltante sin repetir lo recibido', async () => {
    const respuesta = await con(request(app).post(`/api/usuarios/${ANA}/metodos-pago`).send({ numero: '4242424242424242' }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores.map((e) => e.campo)).toEqual(expect.arrayContaining(['titular', 'vencimientoMes', 'vencimientoAnio', 'cvv']));
    expect(JSON.stringify(respuesta.body)).not.toContain('4242424242424242');
    expect(metodoPagoService.agregarMetodoDePago).not.toHaveBeenCalled();
  });

  it('POST muestra el error por campo de una tarjeta inválida (Luhn, vencida)', async () => {
    metodoPagoService.agregarMetodoDePago.mockRejectedValue(
      new ErrorDeAplicacion('La tarjeta no es válida', 400, 'TARJETA_INVALIDA', [{ campo: 'numero', mensaje: 'El número de tarjeta no es válido' }])
    );

    const respuesta = await con(request(app).post(`/api/usuarios/${ANA}/metodos-pago`).send({ ...tarjetaValida, numero: '4242424242424241' }));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({ mensaje: 'La tarjeta no es válida', codigo: 'TARJETA_INVALIDA', errores: [{ campo: 'numero', mensaje: 'El número de tarjeta no es válido' }] });
    expect(JSON.stringify(respuesta.body)).not.toContain('4242424242424241');
  });

  it('DELETE elimina la tarjeta y valida el id', async () => {
    metodoPagoService.eliminarMetodoDePago.mockResolvedValue(undefined);

    const mal = await con(request(app).delete(`/api/usuarios/${ANA}/metodos-pago/no-es-uuid`));
    expect(mal.status).toBe(400);

    const bien = await con(request(app).delete(`/api/usuarios/${ANA}/metodos-pago/${METODO}`));
    expect(bien.status).toBe(200);
    expect(metodoPagoService.eliminarMetodoDePago).toHaveBeenCalledWith(ANA, METODO);
  });

  describe('HTTPS obligatorio (EXIGIR_HTTPS_PAGOS=true)', () => {
    beforeEach(() => {
      env.exigirHttpsPagos = true;
    });

    afterEach(() => {
      env.exigirHttpsPagos = false;
    });

    it('rechaza con 426 las rutas de tarjetas que no llegaron por HTTPS, sin procesarlas', async () => {
      const respuesta = await con(request(app).post(`/api/usuarios/${ANA}/metodos-pago`).send(tarjetaValida));

      expect(respuesta.status).toBe(426);
      expect(respuesta.body.codigo).toBe('HTTPS_REQUERIDO');
      expect(metodoPagoService.agregarMetodoDePago).not.toHaveBeenCalled();

      expect((await con(request(app).get(`/api/usuarios/${ANA}/metodos-pago`))).status).toBe(426);
      expect((await con(request(app).delete(`/api/usuarios/${ANA}/metodos-pago/${METODO}`))).status).toBe(426);
    });

    it('no afecta a las demás rutas (el perfil sigue funcionando)', async () => {
      perfilService.obtenerPerfil.mockResolvedValue({ id: ANA });

      expect((await con(request(app).get(`/api/usuarios/${ANA}`))).status).toBe(200);
    });
  });
});

describe('administración (US-29)', () => {
  const codigo = 'CY-D1AD1C79';

  beforeEach(() => {
    jest.clearAllMocks();
    usuarioRepository.buscarPorId.mockResolvedValue({ id: ANA, rol: 'administrador' });
  });

  const rutas = [
    ['post', '/api/admin/reservas/verificar'],
    ['post', `/api/admin/reservas/${codigo}/usar`],
    ['get', '/api/admin/verificaciones'],
  ];

  it.each(rutas)('%s %s sin token responde 401', async (metodo, ruta) => {
    expect((await request(app)[metodo](ruta)).status).toBe(401);
  });

  it.each(rutas)('%s %s con un usuario sin rol de administrador responde 403', async (metodo, ruta) => {
    usuarioRepository.buscarPorId.mockResolvedValue({ id: ANA, rol: 'usuario' });

    const respuesta = await con(request(app)[metodo](ruta).send({ codigo }));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.mensaje).toBe('Solo los administradores pueden realizar esta acción');
    Object.values(verificacionReservaService).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('un usuario que ya no existe tampoco pasa (403)', async () => {
    usuarioRepository.buscarPorId.mockResolvedValue(null);

    expect((await con(request(app).get('/api/admin/verificaciones'))).status).toBe(403);
  });

  it('si falla la consulta del rol responde el error del servidor', async () => {
    const silencio = jest.spyOn(console, 'error').mockImplementation(() => {});
    usuarioRepository.buscarPorId.mockRejectedValue(new Error('la base se cayó'));

    expect((await con(request(app).get('/api/admin/verificaciones'))).status).toBe(500);
    silencio.mockRestore();
  });

  it('el administrador verifica un código y recibe el resultado', async () => {
    verificacionReservaService.verificarCodigo.mockResolvedValue({ estado: 'vigente', motivo: null, reserva: { codigo } });

    const respuesta = await con(request(app).post('/api/admin/reservas/verificar').send({ codigo }));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estado).toBe('vigente');
    expect(verificacionReservaService.verificarCodigo).toHaveBeenCalledWith(ANA, codigo);
  });

  it('exige que el código venga como texto no vacío', async () => {
    for (const cuerpo of [{}, { codigo: '   ' }, { codigo: 12345 }]) {
      const respuesta = await con(request(app).post('/api/admin/reservas/verificar').send(cuerpo));
      expect(respuesta.status).toBe(400);
    }
    expect(verificacionReservaService.verificarCodigo).not.toHaveBeenCalled();
  });

  it('un código inexistente responde 404 "Código no encontrado"', async () => {
    verificacionReservaService.verificarCodigo.mockRejectedValue(new ErrorDeAplicacion('Código no encontrado', 404, 'CODIGO_NO_ENCONTRADO'));

    const respuesta = await con(request(app).post('/api/admin/reservas/verificar').send({ codigo: 'ZZZ' }));

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({ mensaje: 'Código no encontrado', codigo: 'CODIGO_NO_ENCONTRADO' });
  });

  it('marca como utilizada y traduce el 409 cuando ya no está vigente', async () => {
    verificacionReservaService.marcarComoUsada.mockResolvedValueOnce({ estado: 'no_vigente', motivo: 'usada', reserva: { codigo } });
    expect((await con(request(app).post(`/api/admin/reservas/${codigo}/usar`))).status).toBe(200);
    expect(verificacionReservaService.marcarComoUsada).toHaveBeenCalledWith(ANA, codigo);

    verificacionReservaService.marcarComoUsada.mockRejectedValueOnce(new ErrorDeAplicacion('La reserva no está vigente (usada)', 409, 'RESERVA_NO_VIGENTE'));
    const repetida = await con(request(app).post(`/api/admin/reservas/${codigo}/usar`));
    expect(repetida.status).toBe(409);
    expect(repetida.body.codigo).toBe('RESERVA_NO_VIGENTE');
  });

  it('lista la auditoría con un límite validado', async () => {
    verificacionReservaService.listarVerificaciones.mockResolvedValue([{ id: 'v1', codigo, resultado: 'vigente' }]);

    const respuesta = await con(request(app).get('/api/admin/verificaciones').query({ limite: 5 }));
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.verificaciones).toHaveLength(1);
    expect(verificacionReservaService.listarVerificaciones).toHaveBeenCalledWith(5);

    expect((await con(request(app).get('/api/admin/verificaciones').query({ limite: 1000 }))).status).toBe(400);
  });
});

describe('reservas con pago: validación del método de pago (US-28)', () => {
  it('rechaza con 400 un metodoPagoId que no es un UUID', async () => {
    const respuesta = await con(
      request(app).post('/api/canchas/44444444-4444-4444-8444-444444444444/reservas').send({ fecha: '2099-01-01', horaInicio: '10:00', horaFin: '11:00', metodoPagoId: 'tarjeta-1' })
    );

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores).toEqual([{ campo: 'metodoPagoId', mensaje: 'El id del método de pago no es válido' }]);
  });
});
