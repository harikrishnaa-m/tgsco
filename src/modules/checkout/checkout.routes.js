import { Router } from 'express';

import { requireUser } from '../auth/auth.middleware.js';
import {
  cancel,
  create,
  detail,
  list,
  summary,
  verifyPayment,
  webhook,
} from './checkout.controller.js';

const router = Router();

router.post('/payments/razorpay/webhook', webhook);
router.use(requireUser);
router.get('/summary', summary);
router.post('/orders', create);
router.get('/orders', list);
router.get('/orders/:id', detail);
router.post('/orders/:id/cancel', cancel);
router.post('/payments/razorpay/verify', verifyPayment);

export default router;
