import {
  cancelOrder,
  createOrder,
  getCheckoutSummary,
  getOrder,
  handleRazorpayWebhook,
  listOrders,
  verifyRazorpayPayment,
} from './checkout.service.js';
import { logger } from '../../config/logger.js';
import {
  checkoutOrderSchema,
  orderIdSchema,
  paymentVerificationSchema,
  cancellationSchema,
} from './checkout.validation.js';

export async function summary(req, res) {
  res.json({ success: true, data: await getCheckoutSummary(req.user) });
}

export async function create(req, res) {
  res.status(201).json({
    success: true,
    data: await createOrder(
      req.user,
      checkoutOrderSchema.parse(req.body),
      req.get('Idempotency-Key'),
    ),
  });
}

export async function verifyPayment(req, res) {
  res.json({
    success: true,
    data: await verifyRazorpayPayment(req.user, paymentVerificationSchema.parse(req.body)),
  });
}

export async function webhook(req, res) {
  try {
    const data = await handleRazorpayWebhook(req.rawBody, req.get('X-Razorpay-Signature'));
    res.json({ success: true, data });
  } catch (error) {
    logger.error(
      {
        err: error,
        webhook: 'razorpay',
        stage: 'request_failed',
        requestId: req.id,
      },
      'Razorpay webhook request failed',
    );
    throw error;
  }
}

export async function list(req, res) {
  res.json({ success: true, data: await listOrders(req.user) });
}

export async function detail(req, res) {
  res.json({ success: true, data: await getOrder(req.user, orderIdSchema.parse(req.params.id)) });
}

export async function cancel(req, res) {
  res.json({
    success: true,
    data: await cancelOrder(
      req.user,
      orderIdSchema.parse(req.params.id),
      cancellationSchema.parse(req.body).reason,
    ),
  });
}
