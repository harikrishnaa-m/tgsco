import { Router } from 'express';

import { requireUser } from '../auth/auth.middleware.js';
import {
  addItem,
  clearCurrentCart,
  getCurrentCart,
  mergeCurrentCart,
  removeItem,
  updateItem,
} from './cart.controller.js';

const router = Router();

router.use(requireUser);
router.get('/', getCurrentCart);
router.post('/merge', mergeCurrentCart);
router.post('/items', addItem);
router.patch('/items/:productId', updateItem);
router.delete('/items/:productId', removeItem);
router.delete('/', clearCurrentCart);

export default router;
