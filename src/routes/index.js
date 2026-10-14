import { Router } from 'express';

import healthRoutes from './health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import homeContentRoutes from '../modules/home-content/home-content.routes.js';
import aboutContentRoutes from '../modules/about-content/about-content.routes.js';
import schemeContentRoutes from '../modules/scheme-content/scheme-content.routes.js';
import heritageContentRoutes from '../modules/heritage-content/heritage-content.routes.js';
import newsContentRoutes from '../modules/news-content/news-content.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/home-content', homeContentRoutes);
router.use('/about-content', aboutContentRoutes);
router.use('/scheme-content', schemeContentRoutes);
router.use('/heritage-content', heritageContentRoutes);
router.use('/news-content', newsContentRoutes);

export default router;
