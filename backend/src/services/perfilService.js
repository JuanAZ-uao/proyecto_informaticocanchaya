// Perfil del usuario (US-27): ver y editar datos, cambiar la contraseña y cambiar el correo con verificación.
const bcrypt = require('bcryptjs');
const usuarioRepository = require('../repositories/usuarioRepository');
const cambioCorreoRepository = require('../repositories/cambioCorreoRepository');
const { generarTokenPlano, hashearToken } = require('../utils/resetToken');
const emailService = require('./emailService');
const env = require('../config/env');
const ErrorDeAplicacion = require('../utils/ErrorDeAplicacion');

const SALT_ROUNDS = 10;
const CODIGO_POSTGRES_DUPLICADO = '23505';

function aPerfil(usuario) {
  return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, telefono: usuario.telefono, rol: usuario.rol };
}

async function buscarOFallar(usuarioId) {
  const usuario = await usuarioRepository.buscarPorId(usuarioId);
  if (!usuario) {
    throw new ErrorDeAplicacion('Usuario no encontrado', 404);
  }
  return usuario;
}

async function obtenerPerfil(usuarioId) {
  const usuario = await buscarOFallar(usuarioId);
  const pendiente = await cambioCorreoRepository.buscarPendienteDeUsuario(usuarioId);

  return { ...aPerfil(usuario), correoPendiente: pendiente?.nuevoCorreo ?? null };
}

async function actualizarPerfil(usuarioId, { nombre, telefono }) {
  await buscarOFallar(usuarioId);
  const actualizado = await usuarioRepository.actualizarPerfil(usuarioId, { nombre, telefono });

  return aPerfil(actualizado);
}

async function cambiarPassword(usuarioId, { passwordActual, nuevaPassword }) {
  const usuario = await buscarOFallar(usuarioId);

  if (!(await bcrypt.compare(passwordActual, usuario.passwordHash))) {
    // 400 y no 401: un 401 haría que el navegador cierre la sesión por creer que el token venció.
    throw new ErrorDeAplicacion('La contraseña actual no es correcta', 400, 'PASSWORD_ACTUAL_INCORRECTA', [
      { campo: 'passwordActual', mensaje: 'La contraseña actual no es correcta' },
    ]);
  }

  if (nuevaPassword === passwordActual) {
    throw new ErrorDeAplicacion('La nueva contraseña debe ser distinta a la actual', 400, 'PASSWORD_REPETIDA', [
      { campo: 'nuevaPassword', mensaje: 'La nueva contraseña debe ser distinta a la actual' },
    ]);
  }

  const passwordHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);
  await usuarioRepository.actualizarPassword(usuarioId, passwordHash);
}

// El correo NO cambia aquí: se manda un enlace al correo nuevo y el cambio se aplica al abrirlo.
async function solicitarCambioCorreo(usuarioId, { nuevoCorreo, urlBaseFrontend }) {
  const usuario = await buscarOFallar(usuarioId);
  const correo = nuevoCorreo.trim().toLowerCase();

  if (correo === usuario.correo) {
    throw new ErrorDeAplicacion('El nuevo correo debe ser distinto al actual', 400, 'CORREO_SIN_CAMBIO', [
      { campo: 'nuevoCorreo', mensaje: 'El nuevo correo debe ser distinto al actual' },
    ]);
  }

  if (await usuarioRepository.buscarPorCorreo(correo)) {
    throw new ErrorDeAplicacion('El correo ya está registrado', 409, 'CORREO_DUPLICADO');
  }

  await cambioCorreoRepository.invalidarPendientesDeUsuario(usuarioId);

  const tokenPlano = generarTokenPlano();
  const expiresAt = new Date(Date.now() + env.cambioCorreoTokenExpiresMin * 60 * 1000);
  await cambioCorreoRepository.crear({ usuarioId, nuevoCorreo: correo, tokenHash: hashearToken(tokenPlano), expiresAt });

  await emailService.enviarCorreoVerificacionCorreo({
    para: correo,
    nombre: usuario.nombre,
    enlaceVerificacion: `${urlBaseFrontend}/verificar-correo?token=${tokenPlano}`,
  });
}

async function confirmarCambioCorreo({ token }) {
  const registro = await cambioCorreoRepository.buscarValidoPorHash(hashearToken(token));
  if (!registro) {
    throw new ErrorDeAplicacion('El enlace de verificación es inválido o ha expirado', 400);
  }

  // Entre la solicitud y la verificación otra cuenta pudo registrar ese correo.
  const existente = await usuarioRepository.buscarPorCorreo(registro.nuevoCorreo);
  if (existente && existente.id !== registro.usuarioId) {
    await cambioCorreoRepository.marcarUsado(registro.id);
    throw new ErrorDeAplicacion('El correo ya está registrado', 409, 'CORREO_DUPLICADO');
  }

  try {
    await usuarioRepository.actualizarCorreo(registro.usuarioId, registro.nuevoCorreo);
  } catch (error) {
    if (error.code === CODIGO_POSTGRES_DUPLICADO) {
      throw new ErrorDeAplicacion('El correo ya está registrado', 409, 'CORREO_DUPLICADO');
    }
    throw error;
  }

  await cambioCorreoRepository.marcarUsado(registro.id);

  return { correo: registro.nuevoCorreo };
}

module.exports = { obtenerPerfil, actualizarPerfil, cambiarPassword, solicitarCambioCorreo, confirmarCambioCorreo };
