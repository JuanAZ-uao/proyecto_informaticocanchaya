const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const reservaController = require('../controllers/reservaController');
const temporizadorController = require('../controllers/temporizadorController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const {
  obtenerDetalleValidators,
  filtrarCanchasValidators,
  listarOcupadosValidators,
} = require('../utils/validators/canchaValidators');
const { crearReservaValidators } = require('../utils/validators/reservaValidators');

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
router.get(
  '/:id/disponibilidad',
  authMiddleware,
  listarOcupadosValidators,
  validate,
  canchaController.listarOcupados
);
router.post(
  '/:id/reservas',
  authMiddleware,
  crearReservaValidators,
  validate,
  reservaController.crear
);
router.post(
  '/:id/temporizador/completar',
  authMiddleware,
  obtenerDetalleValidators,
  validate,
  temporizadorController.completarPanel
);

module.exports = router;
