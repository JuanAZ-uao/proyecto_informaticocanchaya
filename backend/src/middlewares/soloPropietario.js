// Un usuario solo puede ver y modificar sus propios datos (perfil, contraseña, correo, tarjetas):
// si el :id de la ruta no es el del token, responde 403 sin tocar nada. Va después de authMiddleware.
function soloPropietario(req, res, next) {
  if (req.params.id !== req.usuarioId) {
    return res.status(403).json({ mensaje: 'No tienes permiso para acceder a los datos de otro usuario' });
  }

  return next();
}

module.exports = soloPropietario;
