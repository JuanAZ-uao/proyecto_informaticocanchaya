function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;

  if (statusCode === 500) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({
    mensaje: statusCode === 500 ? 'Error interno del servidor' : err.message,
    ...(statusCode !== 500 && err.codigo ? { codigo: err.codigo } : {}),
    // Errores por campo (por ejemplo, los de una tarjeta inválida), con el mismo formato que la validación de entrada.
    ...(statusCode !== 500 && err.errores ? { errores: err.errores } : {}),
  });
}

module.exports = errorHandler;
