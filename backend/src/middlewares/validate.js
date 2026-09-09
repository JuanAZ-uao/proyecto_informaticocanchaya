const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    return res.status(400).json({
      mensaje: 'Error de validación',
      errores: errores.array().map((error) => ({
        campo: error.path,
        mensaje: error.msg,
      })),
    });
  }

  return next();
}

module.exports = validate;
