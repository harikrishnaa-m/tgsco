import { Address } from '../../models/address.model.js';
import { Order } from '../../models/order.model.js';
import { Return } from '../../models/return.model.js';
import { RefundMethod } from '../../models/refund-method.model.js';
import { OrderPolicySettings } from '../../models/settings.model.js';
import { AppError } from '../../errors/app-error.js';
import { initiateRazorpayRefund } from '../checkout/checkout.service.js';
import { notifyAdmins, notifyOrderOwner } from '../notifications/notifications.service.js';

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'pickup_pending',
  'received',
  'inspection_pending',
  'approved_for_refund',
  'refund_pending',
  'refunded',
  'completed',
  'cancelled',
];
export const RETURN_REASONS = [
  'damaged',
  'defective',
  'wrong_item',
  'missing_item',
  'not_as_described',
  'changed_mind',
  'other',
];
export const RETURN_TRANSITIONS = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['pickup_pending', 'cancelled'],
  rejected: [],
  pickup_pending: ['received', 'cancelled'],
  received: ['inspection_pending'],
  inspection_pending: ['approved_for_refund', 'rejected'],
  approved_for_refund: ['refund_pending'],
  refund_pending: ['refunded', 'completed'],
  refunded: ['completed'],
  completed: [],
  cancelled: [],
};
const policy = async () =>
  (await OrderPolicySettings.findOne({ key: 'default' }).lean()) || {
    cancellationAllowedUntil: 'shipped',
    returnWindowDays: 7,
  };
const findOrder = async (id, user) => {
  const order = await Order.findOne({ _id: id, ...(user ? { user: user.sub } : {}) });
  if (!order)
    throw new AppError('The order was not found.', { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  return order;
};
const deliveredAt = (order) =>
  order.timeline?.filter((x) => x.type === 'status' && /delivered/i.test(x.message)).at(-1)
    ?.createdAt ||
  order.shipment?.deliveredAt ||
  order.updatedAt;
const addTimeline = (entity, message, by) =>
  entity.timeline.push({ status: entity.status, message, by, at: new Date() });
const total = (item) => item.items.reduce((s, x) => s + x.lineTotal, 0);
const refundMethodSnapshot = (method) => {
  if (method.method === 'upi') {
    return { method: 'upi', upiId: method.upiId, label: method.label };
  }
  return {
    method: 'bank_transfer',
    bankDetails: method.bankDetails,
    label: method.label,
  };
};
const formatRefundMethod = (method) => {
  const value = method.toObject ? method.toObject() : method;
  if (value.bankDetails?.accountNumber) {
    value.bankDetails = {
      ...value.bankDetails,
      accountNumber: `********${value.bankDetails.accountNumber.slice(-4)}`,
    };
  }
  delete value.__v;
  return value;
};

export async function createRefundMethod(user, input) {
  const method = await RefundMethod.create({
    user: user.sub,
    method: input.method,
    upiId: input.method === 'upi' ? input.upiId : undefined,
    bankDetails:
      input.method === 'bank_transfer'
        ? {
            accountHolderName: input.accountHolderName,
            accountNumber: input.accountNumber,
            ifscCode: input.ifscCode,
            bankName: input.bankName,
            branchName: input.branchName,
            accountType: input.accountType,
          }
        : null,
    label: input.label,
    isDefault: input.isDefault,
  });
  if (method.isDefault)
    await RefundMethod.updateMany(
      { user: user.sub, _id: { $ne: method._id } },
      { $set: { isDefault: false } },
    );
  return formatRefundMethod(method);
}
export async function listRefundMethods(user) {
  const methods = await RefundMethod.find({ user: user.sub }).sort({
    isDefault: -1,
    createdAt: -1,
  });
  return methods.map(formatRefundMethod);
}
export async function getRefundMethod(user, id) {
  const method = await RefundMethod.findOne({ _id: id, user: user.sub });
  if (!method)
    throw new AppError('The refund method was not found.', {
      statusCode: 404,
      code: 'REFUND_METHOD_NOT_FOUND',
    });
  return formatRefundMethod(method);
}
export async function updateRefundMethod(user, id, input) {
  const method = await RefundMethod.findOne({ _id: id, user: user.sub });
  if (!method)
    throw new AppError('The refund method was not found.', {
      statusCode: 404,
      code: 'REFUND_METHOD_NOT_FOUND',
    });
  method.method = input.method;
  method.upiId = input.method === 'upi' ? input.upiId : undefined;
  method.bankDetails =
    input.method === 'bank_transfer'
      ? {
          accountHolderName: input.accountHolderName,
          accountNumber: input.accountNumber,
          ifscCode: input.ifscCode,
          bankName: input.bankName,
          branchName: input.branchName,
          accountType: input.accountType,
        }
      : null;
  method.label = input.label;
  method.isDefault = input.isDefault;
  await method.save();
  if (method.isDefault)
    await RefundMethod.updateMany(
      { user: user.sub, _id: { $ne: method._id } },
      { $set: { isDefault: false } },
    );
  return formatRefundMethod(method);
}
export async function deleteRefundMethod(user, id) {
  const method = await RefundMethod.findOneAndDelete({ _id: id, user: user.sub });
  if (!method)
    throw new AppError('The refund method was not found.', {
      statusCode: 404,
      code: 'REFUND_METHOD_NOT_FOUND',
    });
  return { id, deleted: true };
}

export async function createReturn(user, orderId, input) {
  const order = await findOrder(orderId, user);
  if (order.orderStatus !== 'delivered')
    throw new AppError('Only delivered orders can be returned.', {
      statusCode: 409,
      code: 'ORDER_NOT_DELIVERED',
    });
  const settings = await policy();
  const deadline = new Date(
    new Date(deliveredAt(order)).getTime() + settings.returnWindowDays * 86400000,
  );
  if (new Date() > deadline)
    throw new AppError(
      `This order is outside the ${settings.returnWindowDays}-day return window.`,
      { statusCode: 409, code: 'RETURN_WINDOW_EXPIRED', details: { deadline } },
    );
  const address = await Address.findOne({ _id: input.pickupAddressId, user: user.sub }).lean();
  if (!address)
    throw new AppError('The pickup address was not found for this account.', {
      statusCode: 400,
      code: 'PICKUP_ADDRESS_NOT_OWNED',
    });
  let selectedRefundMethod = null;
  if (order.paymentMethod === 'cod') {
    if (!input.refundMethodId)
      throw new AppError('Select a UPI or bank-transfer refund method for a COD return.', {
        statusCode: 400,
        code: 'REFUND_METHOD_REQUIRED',
      });
    selectedRefundMethod = await RefundMethod.findOne({
      _id: input.refundMethodId,
      user: user.sub,
    }).lean();
    if (!selectedRefundMethod)
      throw new AppError('The selected refund method was not found for this account.', {
        statusCode: 400,
        code: 'REFUND_METHOD_NOT_OWNED',
      });
  }
  const existing = await Return.find({
    order: order._id,
    status: { $nin: ['rejected', 'cancelled'] },
  }).lean();
  const requested = new Map();
  existing
    .flatMap((r) => r.items)
    .forEach((i) =>
      requested.set(String(i.productId), (requested.get(String(i.productId)) || 0) + i.quantity),
    );
  const items = input.items.map((i) => {
    const source = order.items.find((x) => String(x.productId) === i.productId);
    if (!source)
      throw new AppError('Every return product must belong to the order.', {
        statusCode: 400,
        code: 'RETURN_PRODUCT_NOT_IN_ORDER',
      });
    if (i.quantity + (requested.get(i.productId) || 0) > source.quantity)
      throw new AppError(`Return quantity for ${source.name} exceeds the purchased quantity.`, {
        statusCode: 409,
        code: 'RETURN_QUANTITY_EXCEEDED',
      });
    return {
      productId: source.productId,
      quantity: i.quantity,
      name: source.name,
      sku: source.sku,
      unitPrice: source.unitPrice,
      lineTotal: source.unitPrice * i.quantity,
    };
  });
  const result = await Return.create({
    order: order._id,
    user: user.sub,
    items,
    reason: input.reason,
    customerNote: input.customerNote,
    pickupAddressId: address._id,
    pickupAddress: address,
    refundMethodId: selectedRefundMethod?._id,
    refundMethod: selectedRefundMethod ? refundMethodSnapshot(selectedRefundMethod) : null,
    timeline: [{ status: 'requested', message: 'Return requested', at: new Date() }],
  });
  order.returnIds.push(result._id);
  order.returnStatus = 'requested';
  order.timeline.push({ type: 'return', message: 'Return requested', by: user.sub });
  await order.save();
  const notification = {
    type: 'return.requested',
    title: 'Return requested',
    message: `A return was requested for order ${order.orderNumber}.`,
    data: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      returnId: result._id.toString(),
      status: result.status,
    },
    eventKey: `return-requested:${result._id}`,
  };
  await Promise.all([notifyOrderOwner(order, notification), notifyAdmins(notification)]);
  return result;
}
const response = (item) =>
  Return.findById(item._id)
    .populate('order', 'orderNumber orderStatus paymentMethod paymentStatus grandTotal')
    .lean();
export async function getReturn(user, id) {
  const item = await Return.findOne({ _id: id, user: user.sub });
  if (!item)
    throw new AppError('The return was not found.', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
  return response(item);
}
export async function getAdminReturn(id) {
  const item = await Return.findById(id)
    .populate({ path: 'user', select: 'email name mobile role isVerified createdAt updatedAt' })
    .populate({
      path: 'order',
      populate: { path: 'user', select: 'email name mobile role isVerified createdAt updatedAt' },
    })
    .lean();
  if (!item)
    throw new AppError('The return was not found.', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
  return item;
}
function filters(query, owner) {
  const f = owner ? { user: owner.sub } : {};
  if (query.order) f.order = query.order;
  if (query.status) f.status = query.status;
  if (query.reason) f.reason = query.reason;
  if (query.from || query.to) f.createdAt = {};
  if (query.from) f.createdAt.$gte = query.from;
  if (query.to) f.createdAt.$lte = query.to;
  if (query.search)
    f.$or = [
      { reason: new RegExp(query.search, 'i') },
      { customerNote: new RegExp(query.search, 'i') },
    ];
  return f;
}
export async function listReturns(user, query = {}, orderId) {
  if (orderId) await findOrder(orderId, user);
  const f = filters({ ...query, order: orderId }, user);
  if (query.paymentMethod || query.paymentStatus) {
    const orders = await Order.find({
      user: user.sub,
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    }).distinct('_id');
    f.order = orderId ? orderId : { $in: orders };
  }
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const [items, totalCount] = await Promise.all([
    Return.find(f)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('order', 'orderNumber orderStatus paymentMethod paymentStatus')
      .lean(),
    Return.countDocuments(f),
  ]);
  return {
    items,
    total: totalCount,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(totalCount / query.limit),
  };
}
export async function cancelReturn(user, id, reason) {
  const item = await Return.findOne({ _id: id, user: user.sub });
  if (!item)
    throw new AppError('The return was not found.', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
  transition(item, 'cancelled');
  item.status = 'cancelled';
  item.cancelledAt = new Date();
  item.cancellationReason = reason;
  addTimeline(item, `Return cancelled by customer: ${reason}`, user.sub);
  await item.save();
  const order = await Order.findByIdAndUpdate(
    item.order,
    { $set: { returnStatus: 'cancelled' } },
    { new: true },
  );
  const notification = {
    type: 'return.cancelled',
    title: 'Return request cancelled',
    message: `The return request for order ${order.orderNumber} was cancelled.`,
    data: { orderId: order._id.toString(), returnId: item._id.toString(), status: item.status },
    eventKey: `return-cancelled:${item._id}`,
  };
  await Promise.all([notifyOrderOwner(order, notification), notifyAdmins(notification)]);
  return item;
}
function transition(item, next) {
  const allowed = RETURN_TRANSITIONS[item.status] || [];
  if (!allowed.includes(next))
    throw new AppError(
      `Return status cannot change from "${item.status}" to "${next}". Allowed next statuses: ${allowed.join(', ') || 'none'}.`,
      {
        statusCode: 409,
        code: 'INVALID_RETURN_TRANSITION',
        details: { currentStatus: item.status, requestedStatus: next, allowedStatuses: allowed },
      },
    );
}
export async function adminListReturns(query = {}) {
  const f = filters(query);
  if (query.paymentMethod || query.paymentStatus) {
    const orders = await Order.find({
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    }).distinct('_id');
    f.order = { $in: orders };
  }
  const sort = query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const [items, totalCount] = await Promise.all([
    Return.find(f)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('order', 'orderNumber orderStatus paymentMethod paymentStatus')
      .lean(),
    Return.countDocuments(f),
  ]);
  return {
    items,
    total: totalCount,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(totalCount / query.limit),
  };
}
export async function returnFilters() {
  const [reasons, paymentMethods, paymentStatuses] = await Promise.all([
    Return.distinct('reason'),
    Order.distinct('paymentMethod'),
    Order.distinct('paymentStatus'),
  ]);
  return {
    statuses: RETURN_STATUSES,
    reasons: [...new Set([...RETURN_REASONS, ...reasons])],
    paymentMethods,
    paymentStatuses,
  };
}
export async function updateReturn(id, input, adminId) {
  const item = await Return.findById(id);
  if (!item)
    throw new AppError('The return was not found.', { statusCode: 404, code: 'RETURN_NOT_FOUND' });
  const order = await Order.findById(item.order);
  if (['refunded', 'completed'].includes(input.status) && order.paymentMethod === 'cod') {
    if (!input.refundMethod || !input.refundReference) {
      throw new AppError(
        'COD refunds require refund method and refund reference before this status change.',
        {
          statusCode: 400,
          code: 'COD_REFUND_DETAILS_REQUIRED',
          details: { required: ['refundMethod', 'refundReference'] },
        },
      );
    }
    if (item.refundMethod?.method && item.refundMethod.method !== input.refundMethod) {
      throw new AppError('The refund method must match the method selected by the customer.', {
        statusCode: 409,
        code: 'REFUND_METHOD_MISMATCH',
      });
    }
  }
  transition(item, input.status);
  item.status = input.status;
  addTimeline(item, input.message || `Return marked ${input.status}`, adminId);
  if (input.status === 'approved_for_refund')
    item.refund = {
      status: 'pending',
      amount: input.refundAmount || total(item),
      returnId: item._id,
      method: item.refundMethod?.method,
      destination: item.refundMethod,
    };
  if (input.status === 'refund_pending') {
    if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'captured') {
      const refund = await initiateRazorpayRefund(
        order,
        {
          amount: input.refundAmount || total(item),
          reason: 'return',
          notes: { returnId: String(item._id) },
        },
        `return-${item._id}`,
      );
      item.refund = {
        status: 'pending',
        amount: refund.amount,
        refundId: refund.refundId,
        returnId: item._id,
      };
    } else {
      item.refund = {
        status: 'manual_pending',
        amount: input.refundAmount || total(item),
        returnId: item._id,
        method: item.refundMethod?.method,
        destination: item.refundMethod,
      };
    }
  }
  if (['refunded', 'completed'].includes(input.status) && order.paymentMethod === 'cod') {
    item.refund = {
      ...(item.refund?.toObject ? item.refund.toObject() : item.refund),
      status: 'processed',
      amount: input.refundAmount || item.refund?.amount || total(item),
      method: input.refundMethod,
      reference: input.refundReference,
      processedAt: input.refundProcessedAt || new Date(),
      notes: input.refundNotes,
      processedBy: adminId,
    };
  }
  await item.save();
  const updatedOrder = await Order.findByIdAndUpdate(
    item.order,
    { $set: { returnStatus: item.status } },
    { new: true },
  );
  await notifyOrderOwner(updatedOrder, {
    type: `return.${item.status}`,
    title: 'Return status updated',
    message: `Your return for order ${updatedOrder.orderNumber} is ${item.status.replaceAll('_', ' ')}.`,
    data: {
      orderId: updatedOrder._id.toString(),
      orderNumber: updatedOrder.orderNumber,
      returnId: item._id.toString(),
      status: item.status,
      refundStatus: item.refund?.status,
    },
    eventKey: `return-status:${item._id}:${item.status}`,
  });
  return item;
}
export async function syncRefund(refund) {
  if (!refund.returnId || !['processed', 'refunded'].includes(refund.status)) return;
  const item = await Return.findById(refund.returnId);
  if (!item || item.status === 'completed') return;
  if (!['refund_pending', 'approved_for_refund', 'refunded'].includes(item.status)) return;
  item.status = 'completed';
  addTimeline(item, 'Refund processed', null);
  addTimeline(item, 'Return completed', null);
  await item.save();
  await Order.findByIdAndUpdate(item.order, {
    $set: { returnStatus: 'completed' },
    $push: {
      timeline: {
        $each: [
          { type: 'return', message: 'Refund processed' },
          { type: 'return', message: 'Return completed' },
        ],
      },
    },
  });
}
