const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const { filtrarCanchasValidators } = require('../utils/validators/canchaValidators');

const router = Router();

router.get('/', authMiddleware, filtrarCanchasValidators, validate, canchaController.listar);

module.exports = router;
