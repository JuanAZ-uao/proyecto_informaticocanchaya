const { param, body } = require('express-validator');
const { query } = require('express-validator');

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    .matches(HORA_REGEX)
    .withMessage('horaInicio debe tener formato HH:mm'),
  body('horaFin')
    .notEmpty()
    .withMessage('horaFin es obligatoria')
    .bail()
    .matches(HORA_REGEX)
    .withMessage('horaFin debe tener formato HH:mm'),
];

const cancelarReservaValidators = [
  param('id').isUUID().withMessage('El id de la reserva no es válido'),
];

const completarPanelValidators = crearReservaValidators;


const listarMisReservasValidators = [
  query('periodo')
    .optional()
    .isIn(['proximas', 'pasadas'])
    .withMessage("periodo debe ser 'proximas' o 'pasadas'"),
  query('estado')
    .optional()
    .isIn(['confirmada', 'cancelada', 'completada'])
    .withMessage("estado debe ser 'confirmada', 'cancelada' o 'completada'"),
  query('pagina')
    .optional()
    .isInt({ min: 1 })
    .withMessage('pagina debe ser un entero mayor o igual a 1')
    .toInt(),
  query('limite')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limite debe ser un entero entre 1 y 50')
    .toInt(),
];

module.exports = { crearReservaValidators, cancelarReservaValidators, completarPanelValidators, listarMisReservasValidators };
