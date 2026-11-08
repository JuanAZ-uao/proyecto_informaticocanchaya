const { body, param } = require('express-validator');
const { PASSWORD_REGEX } = require('../passwordPolicy');

// Teléfono: de 7 a 15 dígitos, con un + opcional al inicio. Se aceptan espacios, guiones y paréntesis al escribirlo,
// y se guarda sin ellos.
const TELEFONO_REGEX = /^\+?\d{7,15}$/;
const MENSAJE_TELEFONO = 'El teléfono no es válido (de 7 a 15 dígitos, puede iniciar con +)';
const MENSAJE_PASSWORD = 'La contraseña debe tener mínimo 8 caracteres, incluyendo una letra y un número';

const actualizarPerfilValidators = [
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es obligatorio')
    .bail()
    .isLength({ max: 100 })
    .withMessage('El nombre no puede superar los 100 caracteres'),
  body('telefono')
    .trim()
    .customSanitizer((valor) => String(valor).replace(/[\s()-]/g, ''))
    .notEmpty()
    .withMessage('El teléfono es obligatorio')
    .bail()
    .matches(TELEFONO_REGEX)
    .withMessage(MENSAJE_TELEFONO),
];

const cambiarPasswordValidators = [
  body('passwordActual').notEmpty().withMessage('La contraseña actual es obligatoria'),
  body('nuevaPassword').matches(PASSWORD_REGEX).withMessage(MENSAJE_PASSWORD),
];

const cambiarCorreoValidators = [
  body('nuevoCorreo').trim().isEmail().withMessage('El correo no es válido').normalizeEmail(),
];

const verificarCorreoValidators = [body('token').trim().notEmpty().withMessage('El token es obligatorio')];

// Solo se comprueba que los campos existan y tengan un tamaño razonable; la validación de la tarjeta
// (Luhn, vencimiento, CVV) la hace utils/tarjeta.js. Los mensajes nunca repiten los datos recibidos.
const agregarMetodoPagoValidators = [
  body('numero').notEmpty().withMessage('El número de tarjeta es obligatorio').bail().isLength({ max: 32 }).withMessage('El número de tarjeta no es válido'),
  body('titular').trim().notEmpty().withMessage('El nombre del titular es obligatorio'),
  body('vencimientoMes').notEmpty().withMessage('El mes de vencimiento es obligatorio'),
  body('vencimientoAnio').notEmpty().withMessage('El año de vencimiento es obligatorio'),
  body('cvv').notEmpty().withMessage('El código de seguridad (CVV) es obligatorio').bail().isLength({ max: 4 }).withMessage('El código de seguridad (CVV) no es válido'),
];

const eliminarMetodoPagoValidators = [param('metodoId').isUUID().withMessage('El id del método de pago no es válido')];

module.exports = {
  actualizarPerfilValidators,
  cambiarPasswordValidators,
  cambiarCorreoValidators,
  verificarCorreoValidators,
  agregarMetodoPagoValidators,
  eliminarMetodoPagoValidators,
};
