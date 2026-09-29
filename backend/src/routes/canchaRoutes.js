const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const reservaController = require('../controllers/reservaController');
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
<<<<<<< HEAD
router.get(
  '/:id/disponibilidad',
  authMiddleware,
  listarOcupadosValidators,
  validate,
  canchaController.listarOcupados
);
=======
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
router.post(
  '/:id/reservas',
  authMiddleware,
  crearReservaValidators,
  validate,
<<<<<<< HEAD
  reservaController.confirmar
=======
  reservaController.crear
>>>>>>> origin/US-09/Bloqueo_reserva_duplicada
);

module.exports = router;
