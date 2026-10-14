const { Router } = require('express');
const reservaController = require('../controllers/reservaController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { cancelarReservaValidators, listarMisReservasValidators } = require('../utils/validators/reservaValidators');

const router = Router();

router.get('/', authMiddleware, listarMisReservasValidators, validate, reservaController.listarMias);

router.get('/mias', authMiddleware, reservaController.listarMias);

router.patch(
  '/:id/cancelar',
  authMiddleware,
  cancelarReservaValidators,
  listarMisReservasValidators,
  validate,
  reservaController.cancelar
);

module.exports = router;
