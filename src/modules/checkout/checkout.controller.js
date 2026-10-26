import {
  cancelOrder,
  createOrder,
  getCheckoutSummary,
  getOrder,
  handleRazorpayWebhook,
  listOrders,
  verifyRazorpayPayment,
} from './checkout.service.js';
import { checkoutOrderSchema, orderIdSchema, paymentVerificationSchema } from './checkout.validation.js';

export async function summary(req, res) {
  res.json({ success: true, data: await getCheckoutSummary(req.user) });
}

export async function create(req, res) {
  res.status(201).json({
    success: true,
    data: await createOrder(req.user, checkoutOrderSchema.parse(req.body), req.get('Idempotency-Key')),
  });
}

export async function verifyPayment(req, res) {
  res.json({ success: true, data: await verifyRazorpayPayment(req.user, paymentVerificationSchema.parse(req.body)) });
}

export async function webhook(req, res) {
  res.json({ success: true, data: await handleRazorpayWebhook(req.rawBody, req.get('X-Razorpay-Signature')) });
}

export async function list(req, res) {
  res.json({ success: true, data: await listOrders(req.user) });
}

export async function detail(req, res) {
  res.json({ success: true, data: await getOrder(req.user, orderIdSchema.parse(req.params.id)) });
}

export async function cancel(req, res) {
  res.json({ success: true, data: await cancelOrder(req.user, orderIdSchema.parse(req.params.id)) });
}
