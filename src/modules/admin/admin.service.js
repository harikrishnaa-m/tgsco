import { ChargeSettings, InvoiceSettings } from '../../models/settings.model.js';
import { Order } from '../../models/order.model.js';
import { AppError } from '../../errors/app-error.js';
import {
  initiateRazorpayRefund,
  reconcileRazorpayRefund,
  releaseReservations,
} from '../checkout/checkout.service.js';

const transitions = {
  pending_payment: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'], shipped: ['delivered', 'returned'],
  delivered: ['returned'], returned: ['refunded'], cancelled: ['refunded'],
  refunded: [],
};
const findOrder = async (id) => {
  const order = await Order.findById(id);
  if (!order) throw new AppError('The order was not found.', { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  return order;
};
export async function listAdminOrders(query) {
  const filter = {};
  if (query.status) filter.orderStatus = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.search) filter.$or = [{ orderNumber: new RegExp(query.search, 'i') }, { 'shippingAddress.recipientName': new RegExp(query.search, 'i') }, { 'shippingAddress.mobile': new RegExp(query.search, 'i') }];
  if (query.from || query.to) filter.createdAt = {};
  if (query.from) filter.createdAt.$gte = new Date(query.from);
  if (query.to) filter.createdAt.$lte = new Date(query.to);
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : query.sort === 'total' ? { grandTotal: -1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([Order.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(), Order.countDocuments(filter)]);
  return { items, total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) };
}
export async function getAdminOrder(id) { return (await findOrder(id)).toObject(); }
export async function updateOrderStatus(id, status, message, adminId) {
  const order = await findOrder(id);
  if (!transitions[order.orderStatus]?.includes(status)) throw new AppError(`Order status cannot change from "${order.orderStatus}" to "${status}".`, { statusCode: 409, code: 'INVALID_ORDER_TRANSITION', details: { currentStatus: order.orderStatus, requestedStatus: status, allowedStatuses: transitions[order.orderStatus] || [] } });
  order.orderStatus = status; order.timeline.push({ type: 'status', message: message || `Order status changed to ${status}`, by: adminId }); await order.save(); return order;
}
export async function saveShipment(id, data, adminId) {
  const order = await findOrder(id);
  const shipment = { ...(order.shipment || {}), ...data };
  if (!shipment.courier || !shipment.trackingNumber) throw new AppError('Courier and tracking number are required before saving a shipment.', { statusCode: 400, code: 'INCOMPLETE_SHIPMENT_DETAILS', details: { required: ['courier', 'trackingNumber'] } });
  order.shipment = shipment; order.timeline.push({ type: 'shipment', message: `Shipment updated with ${shipment.courier}`, by: adminId }); await order.save(); return order;
}
export async function addNote(id, message, adminId) { const order = await findOrder(id); order.notes.push(message); order.timeline.push({ type: 'note', message, by: adminId }); await order.save(); return order; }
export async function cancelAdminOrder(id, reason, refund, adminId) {
  const order = await findOrder(id);
  if (!['pending_payment', 'confirmed', 'processing'].includes(order.orderStatus)) throw new AppError(`Order "${order.orderNumber}" cannot be cancelled while it is "${order.orderStatus}".`, { statusCode: 409, code: 'ORDER_CANNOT_BE_CANCELLED', details: { cancellableStatuses: ['pending_payment', 'confirmed', 'processing'] } });
  if (refund?.amount !== undefined && refund.amount > order.grandTotal) throw new AppError('The refund amount cannot exceed the order total.', { statusCode: 400, code: 'INVALID_REFUND_AMOUNT', details: { orderTotal: order.grandTotal, requestedRefund: refund.amount } });
  await releaseReservations(order.reservations);
  order.reservations.forEach((reservation) => {
    if (reservation.status === 'active') reservation.status = 'released';
  });
  order.orderStatus = 'cancelled'; order.cancellation = { reason, by: adminId, at: new Date() };
  if (refund) order.refund = refund;
  order.timeline.push({ type: 'cancellation', message: reason, by: adminId }); await order.save(); return order;
}
export async function invoiceData(id) {
  const order = await findOrder(id);
  if (!order.invoiceNumber) {
    const settings = await InvoiceSettings.findOneAndUpdate(
      { key: 'default', active: true },
      { $inc: { nextSequence: 1 } },
      { new: false },
    ).lean();
    if (settings) {
      const sequence = settings.nextSequence || 1;
      const year = settings.financialYear || new Date().getFullYear().toString();
      const invoiceNumber = `${settings.invoicePrefix || 'INV'}-${year}-${String(sequence).padStart(6, '0')}`;
      const finalized = await Order.findOneAndUpdate(
        { _id: order._id, invoiceNumber: { $exists: false } },
        { $set: { invoiceNumber, invoiceSnapshot: settings } },
        { new: true },
      );
      if (finalized) return { order: finalized.toObject(), invoice: { ...settings, invoiceNumber } };
    } else throw new AppError('Active invoice settings are required before finalizing an invoice.', { statusCode: 409, code: 'INVOICE_SETTINGS_NOT_CONFIGURED', details: { required: ['legalBusinessName', 'sellerAddress', 'invoicePrefix', 'financialYear', 'nextSequence'] } });
  }
  return { order: (await findOrder(id)).toObject(), invoice: { ...(order.invoiceSnapshot || {}), invoiceNumber: order.invoiceNumber } };
}
export async function initiateRefund(id, input, idempotencyKey) {
  const order = await findOrder(id);
  return initiateRazorpayRefund(order, input, idempotencyKey);
}
export async function reconcileRefund(id, refundId) {
  const order = await findOrder(id);
  return reconcileRazorpayRefund(order, refundId);
}
export async function settingsMeta() {
  const [statuses, paymentStatuses, couriers, currencies, totals] = await Promise.all([
    Order.distinct('orderStatus'),
    Order.distinct('paymentStatus'),
    Order.distinct('shipment.courier', { 'shipment.courier': { $exists: true, $ne: null } }),
    Order.distinct('currency'),
    Order.aggregate([{ $group: { _id: null, min: { $min: '$grandTotal' }, max: { $max: '$grandTotal' }, earliest: { $min: '$createdAt' }, latest: { $max: '$createdAt' } } }]),
  ]);
  return {
    orderStatuses: [...new Set([...Object.keys(transitions), ...statuses])],
    paymentStatuses: [...new Set(['pending', 'created', 'authorized', 'captured', 'failed', 'refunded', ...paymentStatuses])],
    chargeTypes: ['shipping', 'packing'], couriers, currencies, totals: totals[0] || {},
  };
}
export async function listSettings(type) {
  if (type === 'invoice') return InvoiceSettings.find({}).sort({ createdAt: -1 }).lean();
  return type ? ChargeSettings.find({ type }).sort({ createdAt: -1 }).lean() : { invoice: await InvoiceSettings.find({}).lean(), charges: await ChargeSettings.find({}).lean() };
}
export async function upsertInvoice(data, id) { return InvoiceSettings.findOneAndUpdate({ key: 'default' }, { ...data, key: 'default', updatedBy: id }, { upsert: true, new: true, runValidators: true }); }
export async function saveCharge(data, chargeId) {
  const duplicate = await ChargeSettings.findOne({ type: data.type, code: data.code, ...(chargeId ? { _id: { $ne: chargeId } } : {}) }).lean();
  if (duplicate) throw new AppError(`A ${data.type} charge with code "${data.code}" already exists.`, { statusCode: 409, code: 'DUPLICATE_CHARGE_SETTING', details: { type: data.type, code: data.code } });
  if (chargeId) {
    const updated = await ChargeSettings.findByIdAndUpdate(chargeId, data, { new: true, runValidators: true });
    if (!updated) throw new AppError('The charge setting was not found.', { statusCode: 404, code: 'CHARGE_SETTING_NOT_FOUND' });
    return updated;
  }
  return ChargeSettings.create(data);
}
export async function archiveCharge(id) {
  const updated = await ChargeSettings.findByIdAndUpdate(id, { active: false, archivedAt: new Date() }, { new: true });
  if (!updated) throw new AppError('The charge setting was not found.', { statusCode: 404, code: 'CHARGE_SETTING_NOT_FOUND' });
  return updated;
}
