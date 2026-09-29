const { param, body } = require('express-validator');

const crearReservaValidators = [
  param('id').isUUID().withMessage('El id de la cancha no es válido'),
  body('fecha')
    .notEmpty()
    .withMessage('fecha es obligatoria')
    .bail()
    .isISO8601()
    .withMessage('fecha debe tener formato ISO (YYYY-MM-DD)'),
  body('horaInicio')
    .notEmpty()
    .withMessage('horaInicio es obligatoria')
    .bail()
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('horaInicio debe tener formato HH:mm'),
  body('horaFin')
    .notEmpty()
    .withMessage('horaFin es obligatoria')
    .bail()
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('horaFin debe tener formato HH:mm'),
];

module.exports = { crearReservaValidators };
