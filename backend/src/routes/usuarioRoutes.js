const { Router } = require('express');
const usuarioController = require('../controllers/usuarioController');
const metodoPagoController = require('../controllers/metodoPagoController');
const authMiddleware = require('../middlewares/authMiddleware');
const soloPropietario = require('../middlewares/soloPropietario');
const exigirHttps = require('../middlewares/exigirHttps');
const validate = require('../middlewares/validate');
const { limitarCambioPassword } = require('../middlewares/limitadores');
const {
  actualizarPerfilValidators,
  cambiarPasswordValidators,
  cambiarCorreoValidators,
  agregarMetodoPagoValidators,
  eliminarMetodoPagoValidators,
} = require('../utils/validators/usuarioValidators');

const router = Router();

// Todas las rutas exigen sesión y que el :id sea el del propio usuario (403 en caso contrario).
const propio = [authMiddleware, soloPropietario];

// US-27: perfil
router.get('/:id', ...propio, usuarioController.obtenerPerfil);
router.patch('/:id', ...propio, actualizarPerfilValidators, validate, usuarioController.actualizarPerfil);
router.patch('/:id/password', ...propio, limitarCambioPassword, cambiarPasswordValidators, validate, usuarioController.cambiarPassword);
router.post('/:id/correo', ...propio, cambiarCorreoValidators, validate, usuarioController.solicitarCambioCorreo);

// US-28: métodos de pago (con HTTPS obligatorio cuando está activado)
router.get('/:id/metodos-pago', ...propio, exigirHttps, metodoPagoController.listar);
router.post('/:id/metodos-pago', ...propio, exigirHttps, agregarMetodoPagoValidators, validate, metodoPagoController.agregar);
router.delete('/:id/metodos-pago/:metodoId', ...propio, exigirHttps, eliminarMetodoPagoValidators, validate, metodoPagoController.eliminar);

module.exports = router;
