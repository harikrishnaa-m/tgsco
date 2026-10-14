import { Router } from 'express';

import healthRoutes from './health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import homeContentRoutes from '../modules/home-content/home-content.routes.js';
import aboutContentRoutes from '../modules/about-content/about-content.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/home-content', homeContentRoutes);
router.use('/about-content', aboutContentRoutes);

export default router;
