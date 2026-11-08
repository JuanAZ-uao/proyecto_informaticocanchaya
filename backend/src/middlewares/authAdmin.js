export const requireAdmin = (req, res, next) => {
  // Asume que req.user es inyectado por el middleware de autenticación previo (JWT)
  if (!req.user || req.user.rol !== 'ADMIN') {
    return res.status(403).json({ 
      error: 'Acceso denegado: Se requieren permisos de administrador.' 
    });
  }
  next();
};
