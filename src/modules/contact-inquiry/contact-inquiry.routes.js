import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { create, list } from './contact-inquiry.controller.js';

const router = Router();

router.post('/', create);
router.get('/', requireAdmin, list);

export default router;
