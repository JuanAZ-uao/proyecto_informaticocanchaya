function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || 500;

  if (statusCode === 500) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({
    mensaje: statusCode === 500 ? 'Error interno del servidor' : err.message,
  });
}

module.exports = errorHandler;
