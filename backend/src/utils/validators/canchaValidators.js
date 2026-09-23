const { param } = require('express-validator');

const obtenerDetalleValidators = [
  param('id').isUUID().withMessage('El id de la cancha no es válido'),
];

module.exports = { obtenerDetalleValidators };
