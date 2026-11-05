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
    .isIn(['confirmada', 'cancelada', 'cancelada_administrativamente', 'completada'])
    .withMessage("estado debe ser 'confirmada', 'cancelada', 'cancelada_administrativamente' o 'completada'"),
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

const listarReservasAdminValidators = [
  query('canchaId').optional().isUUID().withMessage('canchaId debe ser un UUID válido'),
  query('fecha').optional().isISO8601({ strict: true }).withMessage('fecha debe tener formato ISO (YYYY-MM-DD)'),
  query('usuario').optional().isString().isLength({ max: 100 }).withMessage('usuario no puede superar los 100 caracteres'),
  query('pagina').optional().isInt({ min: 1 }).withMessage('pagina debe ser un entero mayor o igual a 1').toInt(),
  query('limite').optional().isInt({ min: 1, max: 50 }).withMessage('limite debe ser un entero entre 1 y 50').toInt(),
];

const cancelarReservaAdminValidators = [
  param('id').isUUID().withMessage('El id de la reserva no es válido'),
  body('motivo')
    .isString()
    .withMessage('El motivo de la cancelación es obligatorio')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('El motivo de la cancelación es obligatorio')
    .bail()
    .isLength({ max: 500 })
    .withMessage('El motivo no puede superar los 500 caracteres'),
];

module.exports = {
  crearReservaValidators,
  cancelarReservaValidators,
  completarPanelValidators,
  listarMisReservasValidators,
  listarReservasAdminValidators,
  cancelarReservaAdminValidators,
};
