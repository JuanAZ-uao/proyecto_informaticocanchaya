const { Router } = require('express');
const reservaController = require('../controllers/reservaController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const validate = require('../middlewares/validate');
const { listarReservasAdminValidators, cancelarReservaAdminValidators } = require('../utils/validators/reservaValidators');

const router = Router();

// US-16: todas las rutas exigen sesión iniciada y rol de administrador.
router.use(authMiddleware, adminMiddleware);

router.get('/reservas', listarReservasAdminValidators, validate, reservaController.listarParaAdmin);

router.patch('/reservas/:id/cancelar', cancelarReservaAdminValidators, validate, reservaController.cancelarComoAdmin);

module.exports = router;
