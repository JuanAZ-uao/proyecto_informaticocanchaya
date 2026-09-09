const { body } = require('express-validator');
const { PASSWORD_REGEX } = require('../passwordPolicy');

const registroValidators = [
  body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('correo').trim().isEmail().withMessage('El correo no es válido').normalizeEmail(),
  body('telefono').trim().notEmpty().withMessage('El teléfono es obligatorio'),
  body('password')
    .matches(PASSWORD_REGEX)
    .withMessage('La contraseña debe tener mínimo 8 caracteres, incluyendo una letra y un número'),
];

const loginValidators = [
  body('correo').trim().isEmail().withMessage('El correo no es válido').normalizeEmail(),
  body('password').notEmpty().withMessage('La contraseña es obligatoria'),
];

const olvidePasswordValidators = [
  body('correo').trim().isEmail().withMessage('El correo no es válido').normalizeEmail(),
];

const restablecerPasswordValidators = [
  body('token').trim().notEmpty().withMessage('El token es obligatorio'),
  body('nuevaPassword')
    .matches(PASSWORD_REGEX)
    .withMessage('La contraseña debe tener mínimo 8 caracteres, incluyendo una letra y un número'),
];

module.exports = {
  registroValidators,
  loginValidators,
  olvidePasswordValidators,
  restablecerPasswordValidators,
};
