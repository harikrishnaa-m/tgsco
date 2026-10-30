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
import cartRoutes from '../modules/cart/cart.routes.js';
import wishlistRoutes from '../modules/wishlist/wishlist.routes.js';
import addressRoutes from '../modules/address/address.routes.js';
import checkoutRoutes from '../modules/checkout/checkout.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import returnsRoutes from '../modules/returns/returns.routes.js';
import profileRoutes from '../modules/profile/profile.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';

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
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/addresses', addressRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/admin', adminRoutes);
router.use('/admin/inventory', inventoryRoutes);
router.use('/notifications', notificationRoutes);
router.use('/profile', profileRoutes);
router.use('/', returnsRoutes);

export default router;
