const { Router } = require('express');
const reservaController = require('../controllers/reservaController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { cancelarReservaValidators } = require('../utils/validators/reservaValidators');

const router = Router();

router.patch(
  '/:id/cancelar',
  authMiddleware,
  cancelarReservaValidators,
  validate,
  reservaController.cancelar
);

module.exports = router;
