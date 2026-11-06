const { Router } = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middlewares/authMiddleware');
const soloAdministrador = require('../middlewares/soloAdministrador');
const validate = require('../middlewares/validate');
const { verificarCodigoValidators, listarVerificacionesValidators } = require('../utils/validators/adminValidators');

const router = Router();

// US-29: todo el panel exige sesión y rol de administrador (403 en caso contrario).
router.use(authMiddleware, soloAdministrador);

router.post('/reservas/verificar', verificarCodigoValidators, validate, adminController.verificarCodigo);
router.post('/reservas/:codigo/usar', adminController.marcarComoUsada);
router.get('/verificaciones', listarVerificacionesValidators, validate, adminController.listarVerificaciones);

module.exports = router;
