const { Router } = require('express');
const authRoutes = require('./authRoutes');
const canchaRoutes = require('./canchaRoutes');
const reservaRoutes = require('./reservaRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/canchas', canchaRoutes);
router.use('/reservas', reservaRoutes);

module.exports = router;
