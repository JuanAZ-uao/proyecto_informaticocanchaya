<<<<<<< HEAD
﻿const { param, body } = require('express-validator');
=======
const { param, body } = require('express-validator');

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada

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
<<<<<<< HEAD
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
=======
    .matches(HORA_REGEX)
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
    .withMessage('horaInicio debe tener formato HH:mm'),
  body('horaFin')
    .notEmpty()
    .withMessage('horaFin es obligatoria')
    .bail()
<<<<<<< HEAD
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('horaFin debe tener formato HH:mm'),
];

module.exports = { crearReservaValidators };
=======
    .matches(HORA_REGEX)
    .withMessage('horaFin debe tener formato HH:mm'),
];

const cancelarReservaValidators = [
  param('id').isUUID().withMessage('El id de la reserva no es válido'),
];

module.exports = { crearReservaValidators, cancelarReservaValidators };
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
