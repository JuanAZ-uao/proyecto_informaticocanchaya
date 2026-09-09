const { Router } = require('express');
const authRoutes = require('./authRoutes');
const canchaRoutes = require('./canchaRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/canchas', canchaRoutes);

module.exports = router;
