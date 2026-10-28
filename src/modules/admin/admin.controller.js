import * as service from './admin.service.js';
import * as v from './admin.validation.js';
import { AppError } from '../../errors/app-error.js';

const parse = (schema, value, code, message) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(message, {
      statusCode: 400,
      code,
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
    });
  }
  return result.data;
};
export const listOrders = async (req, res) =>
  res.json({
    success: true,
    data: await service.listAdminOrders(
      parse(
        v.orderQuery,
        req.query,
        'INVALID_ORDER_FILTERS',
        'Order filters are invalid. Correct the highlighted filters and try again.',
      ),
    ),
  });
export const filters = async (req, res) =>
  res.json({ success: true, data: await service.settingsMeta() });
export const detail = async (req, res) =>
  res.json({
    success: true,
    data: await service.getAdminOrder(
      parse(
        v.orderId,
        req.params.id,
        'INVALID_ORDER_ID',
        'The order ID is invalid. Provide a valid order ID.',
      ),
    ),
  });
export const status = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  const b = parse(
    v.statusBody,
    req.body,
    'INVALID_ORDER_STATUS_REQUEST',
    'The order status update is invalid.',
  );
  res.json({
    success: true,
    data: await service.updateOrderStatus(id, b.status, b.message, req.user.sub),
  });
};
export const shipment = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  res.json({
    success: true,
    data: await service.saveShipment(
      id,
      parse(v.shipmentBody, req.body, 'INVALID_SHIPMENT_REQUEST', 'Shipment details are invalid.'),
      req.user.sub,
    ),
  });
};
export const notes = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  const b = parse(v.noteBody, req.body, 'INVALID_ORDER_NOTE', 'The order note is invalid.');
  res.status(201).json({ success: true, data: await service.addNote(id, b.message, req.user.sub) });
};
export const cancel = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  const b = parse(
    v.cancelBody,
    req.body,
    'INVALID_CANCELLATION_REQUEST',
    'Cancellation or refund details are invalid.',
  );
  res.json({
    success: true,
    data: await service.cancelAdminOrder(id, b.reason, b.refund, req.user.sub),
  });
};
export const invoice = async (req, res) =>
  res.json({
    success: true,
    data: await service.invoiceData(
      parse(
        v.orderId,
        req.params.id,
        'INVALID_ORDER_ID',
        'The order ID is invalid. Provide a valid order ID.',
      ),
    ),
  });
export const initiateRefund = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  const body = parse(
    v.refundBody,
    req.body,
    'INVALID_REFUND_REQUEST',
    'The refund request is invalid.',
  );
  const key = req.get('Idempotency-Key');
  if (!key)
    throw new AppError('Provide an Idempotency-Key header so retrying the refund is safe.', {
      statusCode: 400,
      code: 'REFUND_IDEMPOTENCY_KEY_REQUIRED',
    });
  res.status(201).json({ success: true, data: await service.initiateRefund(id, body, key) });
};
export const reconcileRefund = async (req, res) => {
  const id = parse(
    v.orderId,
    req.params.id,
    'INVALID_ORDER_ID',
    'The order ID is invalid. Provide a valid order ID.',
  );
  const refundId = parse(
    v.refundId,
    req.params.refundId,
    'INVALID_REFUND_ID',
    'The Razorpay refund ID is invalid.',
  );
  res.json({ success: true, data: await service.reconcileRefund(id, refundId) });
};
export const settings = async (req, res) =>
  res.json({ success: true, data: await service.listSettings(req.query.type) });
export const invoiceSettings = async (req, res) =>
  res.json({ success: true, data: await service.listSettings('invoice') });
export const shippingSettings = async (req, res) =>
  res.json({ success: true, data: await service.listSettings('shipping') });
export const packingSettings = async (req, res) =>
  res.json({ success: true, data: await service.listSettings('packing') });
export const orderPolicies = async (req, res) =>
  res.json({ success: true, data: await service.getOrderPolicies() });
export const metadata = async (req, res) =>
  res.json({ success: true, data: await service.settingsMeta() });
export const saveInvoice = async (req, res) =>
  res.json({
    success: true,
    data: await service.upsertInvoice(
      parse(
        v.invoiceBody,
        req.body,
        'INVALID_INVOICE_SETTINGS',
        'Invoice and seller settings are invalid.',
      ),
      req.user.sub,
    ),
  });
export const saveCharge = async (req, res) => {
  const body = { ...req.body, ...(req.params.type ? { type: req.params.type } : {}) };
  res
    .status(req.params.id ? 200 : 201)
    .json({
      success: true,
      data: await service.saveCharge(
        parse(v.chargeBody, body, 'INVALID_CHARGE_RULE', 'The charge rule is invalid.'),
        req.params.id,
      ),
    });
};
export const saveOrderPolicies = async (req, res) =>
  res.json({
    success: true,
    data: await service.saveOrderPolicies(
      parse(
        v.orderPoliciesBody,
        req.body,
        'INVALID_ORDER_POLICIES',
        'Order cancellation and return policies are invalid.',
      ),
      req.user.sub,
    ),
  });
export const archiveCharge = async (req, res) =>
  res.json({ success: true, data: await service.archiveCharge(req.params.id) });
