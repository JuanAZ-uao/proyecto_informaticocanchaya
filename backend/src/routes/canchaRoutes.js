const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { obtenerDetalleValidators } = require('../utils/validators/canchaValidators');

const router = Router();

router.get('/', authMiddleware, canchaController.listar);
router.get('/:id', authMiddleware, obtenerDetalleValidators, validate, canchaController.obtenerDetalle);

module.exports = router;
