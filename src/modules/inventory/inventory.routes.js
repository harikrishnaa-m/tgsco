import { Router } from 'express';
import { requireAdmin } from '../auth/auth.middleware.js';
import * as controller from './inventory.controller.js';

const router = Router();
router.use(requireAdmin);
router.get('/', controller.list);
router.get('/summary', controller.summary);
router.get('/filters', controller.filters);
router.get('/reservations', controller.reservations);
router.get('/:productId', controller.detail);
router.get('/:productId/movements', controller.movements);
router.post('/:productId/adjust', controller.adjust);
router.post('/:productId/restock', controller.restock);
router.post('/:productId/damage', controller.damage);
router.post('/:productId/return', controller.returned);
router.post('/:productId/reconcile', controller.reconcile);

export default router;
