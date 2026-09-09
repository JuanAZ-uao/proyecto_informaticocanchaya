const { Router } = require('express');
const canchaController = require('../controllers/canchaController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = Router();

router.get('/', authMiddleware, canchaController.listar);

module.exports = router;
