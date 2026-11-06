// US-29: las rutas de administración solo las usa quien tiene el rol "administrador". El rol se consulta en la
// base de datos en cada petición (no viaja en el token), así quitarle el rol a alguien surte efecto de inmediato.
// Va después de authMiddleware.
const usuarioRepository = require('../repositories/usuarioRepository');

async function soloAdministrador(req, res, next) {
  try {
    const usuario = await usuarioRepository.buscarPorId(req.usuarioId);

    if (usuario?.rol !== 'administrador') {
      return res.status(403).json({ mensaje: 'Solo los administradores pueden realizar esta acción' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = soloAdministrador;
