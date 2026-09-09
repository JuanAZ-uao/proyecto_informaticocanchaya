const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const passwordResetRepository = require('../repositories/passwordResetRepository');
const { generarToken } = require('../utils/jwt');
const { generarTokenPlano, hashearToken } = require('../utils/resetToken');
const { enviarCorreoRecuperacion } = require('./emailService');
const env = require('../config/env');

const SALT_ROUNDS = 10;

class ErrorDeAplicacion extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

async function registrar({ nombre, correo, telefono, password }) {
  const existente = await usuarioRepository.buscarPorCorreo(correo);
  if (existente) {
    throw new ErrorDeAplicacion('El correo ya está registrado', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const usuario = await usuarioRepository.crear({ nombre, correo, telefono, passwordHash });

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
  };
}

async function iniciarSesion({ correo, password }) {
  const usuario = await usuarioRepository.buscarPorCorreo(correo);
  if (!usuario) {
    throw new ErrorDeAplicacion('Correo o contraseña incorrectos', 401);
  }

  const esValida = await bcrypt.compare(password, usuario.passwordHash);
  if (!esValida) {
    throw new ErrorDeAplicacion('Correo o contraseña incorrectos', 401);
  }

  const token = generarToken({ sub: usuario.id });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
    },
  };
}

async function solicitarRecuperacion({ correo, urlBaseFrontend }) {
  const usuario = await usuarioRepository.buscarPorCorreo(correo);

  // Mensaje neutro: no se revela si el correo existe o no.
  if (!usuario) {
    return;
  }

  await passwordResetRepository.invalidarPendientesDeUsuario(usuario.id);

  const tokenPlano = generarTokenPlano();
  const tokenHash = hashearToken(tokenPlano);
  const expiresAt = new Date(Date.now() + env.passwordResetTokenExpiresMin * 60 * 1000);

  await passwordResetRepository.crear({ usuario: usuario.id, tokenHash, expiresAt });

  const enlaceRestablecimiento = `${urlBaseFrontend}/restablecer-password?token=${tokenPlano}`;
  await enviarCorreoRecuperacion({ para: usuario.correo, enlaceRestablecimiento });
}

async function restablecerPassword({ token, nuevaPassword }) {
  const tokenHash = hashearToken(token);
  const registro = await passwordResetRepository.buscarValidoPorHash(tokenHash);

  if (!registro) {
    throw new ErrorDeAplicacion('El enlace de recuperación es inválido o ha expirado', 400);
  }

  const passwordHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);
  await usuarioRepository.actualizarPassword(registro.usuarioId, passwordHash);
  await passwordResetRepository.marcarUsado(registro.id);
}

module.exports = {
  ErrorDeAplicacion,
  registrar,
  iniciarSesion,
  solicitarRecuperacion,
  restablecerPassword,
};
