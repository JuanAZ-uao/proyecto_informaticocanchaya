const { Router } = require('express');
const authRoutes = require('./authRoutes');
const canchaRoutes = require('./canchaRoutes');
const reservaRoutes = require('./reservaRoutes');
const adminRoutes = require('./adminRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/canchas', canchaRoutes);
router.use('/reservas', reservaRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
