const perfilService = require('../services/perfilService');
const env = require('../config/env');

async function obtenerPerfil(req, res, next) {
  try {
    const usuario = await perfilService.obtenerPerfil(req.usuarioId);
    return res.status(200).json({ usuario });
  } catch (error) {
    return next(error);
  }
}

async function actualizarPerfil(req, res, next) {
  try {
    const { nombre, telefono } = req.body;
    const usuario = await perfilService.actualizarPerfil(req.usuarioId, { nombre, telefono });

    return res.status(200).json({ mensaje: 'Perfil actualizado correctamente', usuario });
  } catch (error) {
    return next(error);
  }
}

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, nuevaPassword } = req.body;
    await perfilService.cambiarPassword(req.usuarioId, { passwordActual, nuevaPassword });

    return res.status(200).json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return next(error);
  }
}

async function solicitarCambioCorreo(req, res, next) {
  try {
    const { nuevoCorreo } = req.body;
    const urlBaseFrontend = req.headers.origin || env.corsOrigin;

    await perfilService.solicitarCambioCorreo(req.usuarioId, { nuevoCorreo, urlBaseFrontend });

    return res.status(202).json({
      mensaje: `Enviamos un enlace de verificación a ${nuevoCorreo}. Tu correo cambiará cuando lo confirmes.`,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { obtenerPerfil, actualizarPerfil, cambiarPassword, solicitarCambioCorreo };
