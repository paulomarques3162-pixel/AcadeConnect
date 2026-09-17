import { Router } from 'express';
import * as ctrl from '../controllers/settingController.js';

const router = Router();

// Configurações públicas (somente leitura).
router.get('/contact', ctrl.getContact);

export default router;
