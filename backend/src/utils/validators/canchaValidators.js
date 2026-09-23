const { query } = require('express-validator');

const filtrarCanchasValidators = [
  query('zona').optional().trim().notEmpty().withMessage('La zona no puede estar vacía'),
  query('precioMin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('precioMin debe ser un número mayor o igual a 0'),
  query('precioMax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('precioMax debe ser un número mayor o igual a 0'),
  query('fecha')
    .optional()
    .isISO8601()
    .withMessage('fecha debe tener formato ISO (YYYY-MM-DD)'),
];

module.exports = { filtrarCanchasValidators };
