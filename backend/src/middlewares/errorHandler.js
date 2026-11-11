function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;

  if (statusCode === 500) {
    // Solo método, ruta (sin query string), mensaje y pila: el objeto completo de un error de pg puede traer
    // valores de la fila (correos, etc.) y no debe llegar a los logs.
    console.error('[ERROR]', req.method, (req.originalUrl || req.url || '').split('?')[0], err.code || '', err.stack || err.message);
  }

  res.status(statusCode).json({
    mensaje: statusCode === 500 ? 'Error interno del servidor' : err.message,
    ...(statusCode !== 500 && err.codigo ? { codigo: err.codigo } : {}),
    // Errores por campo (por ejemplo, los de una tarjeta inválida), con el mismo formato que la validación de entrada.
    ...(statusCode !== 500 && err.errores ? { errores: err.errores } : {}),
  });
}

module.exports = errorHandler;
