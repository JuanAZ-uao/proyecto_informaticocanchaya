import { Router } from 'express';
import { 
  crearCancha, 
  editarCancha, 
  desactivarCancha, 
  listarCanchasPublicas 
} from '../controllers/canchas.controller.js';
import { requireAdmin } from '../middlewares/authAdmin.js';

const router = Router();

// Rutas Públicas
router.get('/', listarCanchasPublicas);

// Rutas Protegidas (Solo Admin)
router.post('/', requireAdmin, crearCancha);
router.put('/:id', requireAdmin, editarCancha);
router.patch('/:id/desactivar', requireAdmin, desactivarCancha);

export default router;
