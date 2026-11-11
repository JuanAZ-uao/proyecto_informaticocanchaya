const { Router } = require('express');
const adminController = require('../controllers/adminController');
const reservaController = require('../controllers/reservaController');
const gestionCanchasController = require('../controllers/gestionCanchasController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const validate = require('../middlewares/validate');
const { listarReservasAdminValidators, cancelarReservaAdminValidators } = require('../utils/validators/reservaValidators');
const { verificarCodigoValidators, listarVerificacionesValidators } = require('../utils/validators/adminValidators');
const {
  crearCanchaValidators,
  editarCanchaValidators,
  obtenerCanchaAdminValidators,
  desactivarCanchaValidators,
  activarCanchaValidators,
} = require('../utils/validators/gestionCanchasValidators');

const router = Router();

// Todo el panel exige sesión iniciada y rol de administrador (403 en caso contrario).
router.use(authMiddleware, adminMiddleware);

// US-16: cancelación administrativa de reservas.
router.get('/reservas', listarReservasAdminValidators, validate, reservaController.listarParaAdmin);
router.patch('/reservas/:id/cancelar', cancelarReservaAdminValidators, validate, reservaController.cancelarComoAdmin);

// US-29: verificación del código de reserva y auditoría.
router.post('/reservas/verificar', verificarCodigoValidators, validate, adminController.verificarCodigo);
router.post('/reservas/:codigo/usar', adminController.marcarComoUsada);
router.get('/verificaciones', listarVerificacionesValidators, validate, adminController.listarVerificaciones);

// US-15: gestión de canchas (crear, editar, desactivar y reactivar).
router.get('/canchas', gestionCanchasController.listar);
router.get('/canchas/:id', obtenerCanchaAdminValidators, validate, gestionCanchasController.obtener);
router.post('/canchas', crearCanchaValidators, validate, gestionCanchasController.crear);
router.put('/canchas/:id', editarCanchaValidators, validate, gestionCanchasController.editar);
router.patch('/canchas/:id/desactivar', desactivarCanchaValidators, validate, gestionCanchasController.desactivar);
router.patch('/canchas/:id/activar', activarCanchaValidators, validate, gestionCanchasController.activar);

module.exports = router;
