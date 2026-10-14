const { Router } = require('express');
const authController = require('../controllers/authController');
const validate = require('../middlewares/validate');
const { limitarLogin, limitarRecuperacion } = require('../middlewares/limitadores');
const {
  registroValidators,
  loginValidators,
  olvidePasswordValidators,
  restablecerPasswordValidators,
} = require('../utils/validators/authValidators');

const router = Router();

router.post('/registro', registroValidators, validate, authController.registro);
router.post('/login', limitarLogin, loginValidators, validate, authController.login);
router.post('/olvide-password', limitarRecuperacion, olvidePasswordValidators, validate, authController.olvidePassword);
router.post('/restablecer-password', restablecerPasswordValidators, validate, authController.restablecerPassword);

module.exports = router;
