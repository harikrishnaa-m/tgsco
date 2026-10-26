import { Router } from 'express';

import { requireUser } from '../auth/auth.middleware.js';
import {
  addItem,
  clearCurrentWishlist,
  getCurrentWishlist,
  mergeCurrentWishlist,
  removeItem,
} from './wishlist.controller.js';

const router = Router();

router.use(requireUser);
router.get('/', getCurrentWishlist);
router.post('/merge', mergeCurrentWishlist);
router.post('/items', addItem);
router.delete('/items/:productId', removeItem);
router.delete('/', clearCurrentWishlist);

export default router;
