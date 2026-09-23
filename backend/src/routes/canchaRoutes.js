const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const {
  obtenerDetalleValidators,
  filtrarCanchasValidators,
  listarOcupadosValidators,
} = require('../utils/validators/canchaValidators');

const router = Router();

router.get('/', authMiddleware, filtrarCanchasValidators, validate, canchaController.listar);
router.get('/:id', authMiddleware, obtenerDetalleValidators, validate, canchaController.obtenerDetalle);
router.get(
  '/:id/reservas',
  authMiddleware,
  listarOcupadosValidators,
  validate,
  canchaController.listarOcupados
);

module.exports = router;
