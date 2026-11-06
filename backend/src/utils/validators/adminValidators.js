const { body, query } = require('express-validator');

// Solo se exige que el código venga como texto: un código mal escrito o inexistente no es un error de
// validación sino "Código no encontrado" (404), igual que uno que no existe, para no revelar nada.
const verificarCodigoValidators = [
  body('codigo').isString().withMessage('El código es obligatorio').bail().trim().notEmpty().withMessage('El código es obligatorio'),
];

const listarVerificacionesValidators = [
  query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('limite debe ser un entero entre 1 y 100').toInt(),
];

module.exports = { verificarCodigoValidators, listarVerificacionesValidators };
