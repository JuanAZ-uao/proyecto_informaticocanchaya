const usuarioRepository = require('../repositories/usuarioRepository');
const { ROL_ADMINISTRADOR } = require('../models/Usuario');

// US-16: debe ir después de authMiddleware. El rol se consulta en la base de datos en cada
// petición (no se confía en el token) para que quitarle el rol a alguien surta efecto de inmediato.
async function adminMiddleware(req, res, next) {
  try {
    const usuario = await usuarioRepository.buscarPorId(req.usuarioId);

    if (!usuario || usuario.rol !== ROL_ADMINISTRADOR) {
      return res.status(403).json({ mensaje: 'Solo los administradores pueden realizar esta acción' });
    }

    req.administrador = { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = adminMiddleware;
