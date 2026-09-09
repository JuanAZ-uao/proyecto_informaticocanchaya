const authService = require('../services/authService');

async function registro(req, res, next) {
  try {
    const { nombre, correo, telefono, password } = req.body;
    const usuario = await authService.registrar({ nombre, correo, telefono, password });

    return res.status(201).json({
      mensaje: 'Cuenta creada correctamente',
      usuario,
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { correo, password } = req.body;
    const resultado = await authService.iniciarSesion({ correo, password });

    return res.status(200).json(resultado);
  } catch (error) {
    return next(error);
  }
}

async function olvidePassword(req, res, next) {
  try {
    const { correo } = req.body;
    const urlBaseFrontend = req.headers.origin || require('../config/env').corsOrigin;

    await authService.solicitarRecuperacion({ correo, urlBaseFrontend });

    return res.status(200).json({
      mensaje: 'Si el correo está registrado, recibirás un enlace de recuperación',
    });
  } catch (error) {
    return next(error);
  }
}

async function restablecerPassword(req, res, next) {
  try {
    const { token, nuevaPassword } = req.body;
    await authService.restablecerPassword({ token, nuevaPassword });

    return res.status(200).json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return next(error);
  }
}

module.exports = { registro, login, olvidePassword, restablecerPassword };
