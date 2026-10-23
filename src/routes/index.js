import { Router } from 'express';

import healthRoutes from './health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import homeContentRoutes from '../modules/home-content/home-content.routes.js';
import aboutContentRoutes from '../modules/about-content/about-content.routes.js';
import schemeContentRoutes from '../modules/scheme-content/scheme-content.routes.js';
import heritageContentRoutes from '../modules/heritage-content/heritage-content.routes.js';
import newsContentRoutes from '../modules/news-content/news-content.routes.js';
import contactContentRoutes from '../modules/contact-content/contact-content.routes.js';
import contactInquiryRoutes from '../modules/contact-inquiry/contact-inquiry.routes.js';
import videoMediaRoutes from '../modules/video-media/video-media.routes.js';
import catalogRoutes from '../modules/catalog/catalog.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/home-content', homeContentRoutes);
router.use('/about-content', aboutContentRoutes);
router.use('/scheme-content', schemeContentRoutes);
router.use('/heritage-content', heritageContentRoutes);
router.use('/news-content', newsContentRoutes);
router.use('/contact-content', contactContentRoutes);
router.use('/contact-inquiries', contactInquiryRoutes);
router.use('/media/videos', videoMediaRoutes);
router.use('/catalog', catalogRoutes);

export default router;
