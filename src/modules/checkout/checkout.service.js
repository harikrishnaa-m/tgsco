import crypto from 'node:crypto';

import { env } from '../../config/env.js';
import { Address } from '../../models/address.model.js';
import { Cart } from '../../models/cart.model.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { Order } from '../../models/order.model.js';
import { ChargeSettings, InvoiceSettings } from '../../models/settings.model.js';
import { AppError } from '../../errors/app-error.js';
import { getMerchantBulkTier, getUnitPrice } from '../catalog/catalog-pricing.js';

function snapshotAddress(address) {
  const value = address.toObject ? address.toObject() : address;
  return {
    addressId: value._id,
    label: value.label,
    recipientName: value.recipientName,
    mobile: value.mobile,
    alternateMobile: value.alternateMobile,
    addressLine1: value.addressLine1,
    addressLine2: value.addressLine2,
    locality: value.locality,
    landmark: value.landmark,
    city: value.city,
    district: value.district,
    state: value.state,
    stateCode: value.stateCode,
    postalCode: value.postalCode,
    country: value.country,
    deliveryInstructions: value.deliveryInstructions,
  };
}

function toOrderResponse(order, payment) {
  return {
    ...order.toObject(),
    payment: payment || undefined,
  };
}

async function calculateChargesUnsafe(subtotal, paymentMethod, destinationState, sellerState) {
  const charges = await ChargeSettings.find({ active: true }).lean();
  const appliedCharges = [];
  let shippingFee = 0; let packingFee = 0; let codFee = 0; let taxAmount = 0;
  const taxBreakdown = [];
  for (const charge of charges) {
    if (charge.freeAbove !== undefined && subtotal >= charge.freeAbove) continue;
    if (charge.code === 'cod' && paymentMethod !== 'cod') continue;
    const amount = charge.method === 'percentage' ? subtotal * (charge.percentage || 0) / 100 : (charge.amount || 0);
    if (charge.code === 'cod') codFee += amount;
    else if (charge.type === 'shipping') shippingFee += amount;
    if (charge.type === 'packing') packingFee += amount;
    const tax = charge.taxable ? amount * (charge.taxRate || 0) / 100 : 0;
    taxAmount += tax;
    const intraState = destinationState && sellerState
      && destinationState.trim().toLowerCase() === sellerState.trim().toLowerCase();
    const cgst = charge.taxable && intraState ? tax / 2 : 0;
    const sgst = charge.taxable && intraState ? tax / 2 : 0;
    const igst = charge.taxable && !intraState ? tax : 0;
    const component = {
      code: charge.code, name: charge.name, taxableAmount: amount, taxRate: charge.taxRate || 0,
      taxAmount: tax, cgst, sgst, igst,
    };
    appliedCharges.push({ ...component, taxable: charge.taxable });
    if (charge.taxable) taxBreakdown.push(component);
  }
  return { shippingFee, packingFee, codFee, taxAmount, taxBreakdown, appliedCharges };
}

async function calculateCharges(subtotal, paymentMethod, destinationState, sellerState) {
  try {
    const result = await calculateChargesUnsafe(subtotal, paymentMethod, destinationState, sellerState);
    if (!Number.isFinite(result.taxAmount) || !Number.isFinite(result.shippingFee)
      || !Number.isFinite(result.packingFee) || !Number.isFinite(result.codFee)) {
      throw new Error('Charge calculation produced a non-finite amount.');
    }
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Configured checkout charges could not be calculated. Please contact an administrator.', {
      statusCode: 503,
      code: 'CHARGE_CALCULATION_FAILED',
    });
  }
}

async function loadCheckoutData(user) {
  const cart = await Cart.findOne({ user: user.sub }).populate('items.product');
  if (!cart?.items.length) {
    throw new AppError('Your cart is empty.', { statusCode: 409, code: 'CART_EMPTY' });
  }

  const items = cart.items.map((item) => {
    if (!item.product) {
      throw new AppError('One or more products in the cart are unavailable.', {
        statusCode: 409,
        code: 'CART_PRODUCT_UNAVAILABLE',
      });
    }
    const product = item.product;
    const availableQuantity = product.stockQuantity - (product.reservedQuantity || 0);
    const unitPrice = getUnitPrice(product, user.role, item.quantity);
    return {
      product,
      quantity: item.quantity,
      availableQuantity,
      unitPrice,
      lineTotal: unitPrice === undefined ? null : unitPrice * item.quantity,
      bulkEligible: user.role !== 'merchant' || getMerchantBulkTier(product, item.quantity) !== undefined,
    };
  });
  const warnings = [];
  for (const item of items) {
    if (!item.product.active) warnings.push({ productId: item.product._id, type: 'PRODUCT_UNAVAILABLE' });
    if (item.quantity > item.availableQuantity) {
      warnings.push({
        productId: item.product._id,
        type: 'INSUFFICIENT_STOCK',
        availableQuantity: Math.max(item.availableQuantity, 0),
      });
    }
    if (!item.bulkEligible) {
      warnings.push({
        productId: item.product._id,
        type: 'BULK_QUANTITY_REQUIRED',
        message: 'Merchants can only purchase products in configured bulk quantities.',
      });
    }
  }
  const currency = items[0].product.currency || 'INR';
  if (items.some((item) => (item.product.currency || 'INR') !== currency)) {
    throw new AppError('All checkout products must use the same currency.', {
      statusCode: 409,
      code: 'MIXED_CURRENCY_CART',
    });
  }
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  return { cart, items, warnings, currency, subtotal };
}

export async function getCheckoutSummary(user) {
  const { items, warnings, currency, subtotal } = await loadCheckoutData(user);
  const charges = await calculateCharges(subtotal, 'razorpay');
  return {
    items: items.map((item) => ({
      productId: item.product._id,
      sku: item.product.sku,
      name: item.product.name,
      slug: item.product.slug,
      mainImage: item.product.mainImage,
      quantity: item.quantity,
      availableQuantity: Math.max(item.availableQuantity, 0),
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      currency: item.product.currency,
    })),
    subtotal,
    shippingFee: charges.shippingFee,
    packingFee: charges.packingFee,
    codFee: charges.codFee,
    taxAmount: charges.taxAmount,
    taxBreakdown: charges.taxBreakdown,
    discountAmount: 0,
    grandTotal: subtotal + charges.shippingFee + charges.packingFee + charges.codFee + charges.taxAmount,
    currency,
    canCheckout: warnings.length === 0,
    warnings,
  };
}

async function reserveItems(items) {
  const reservations = [];
  try {
    for (const item of items) {
      const result = await CatalogProduct.updateOne(
        {
          _id: item.product._id,
          active: true,
          $expr: {
            $gte: [
              { $subtract: [{ $ifNull: ['$stockQuantity', 0] }, { $ifNull: ['$reservedQuantity', 0] }] },
              item.quantity,
            ],
          },
        },
        { $inc: { reservedQuantity: item.quantity } },
      );
      if (result.modifiedCount !== 1) throw new AppError(`Insufficient stock for ${item.product.name}.`, {
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
      });
      reservations.push({ productId: item.product._id, quantity: item.quantity, status: 'active' });
    }
    return reservations;
  } catch (error) {
    await releaseReservations(reservations);
    throw error;
  }
}

export async function releaseReservations(reservations) {
  for (const reservation of reservations.filter((item) => item.status === 'active')) {
    await CatalogProduct.updateOne(
      { _id: reservation.productId },
      { $inc: { reservedQuantity: -reservation.quantity } },
    );
  }
}

async function consumeReservations(order) {
  for (const reservation of order.reservations.filter((item) => item.status === 'active')) {
    await CatalogProduct.updateOne(
      { _id: reservation.productId },
      { $inc: { reservedQuantity: -reservation.quantity, stockQuantity: -reservation.quantity } },
    );
    reservation.status = 'consumed';
  }
}

async function createRazorpayOrder(order) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('Online payment is not configured.', {
      statusCode: 503,
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    });
  }
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(order.grandTotal * 100),
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { internalOrderId: order._id.toString() },
    }),
  });
  if (!response.ok) {
    throw new AppError('The online payment order could not be created.', {
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
      details: await response.text(),
    });
  }
  return response.json();
}

export async function createOrder(user, input, idempotencyKey) {
  if (idempotencyKey) {
    const existing = await Order.findOne({ user: user.sub, idempotencyKey });
    if (existing) return toOrderResponse(existing);
  }
  if (input.paymentMethod === 'cod' && !env.COD_ENABLED) {
    throw new AppError('Cash on Delivery is not available.', { statusCode: 409, code: 'COD_NOT_AVAILABLE' });
  }
  const { items, warnings, currency, subtotal } = await loadCheckoutData(user);
  if (warnings.length) {
    throw new AppError('Your cart changed. Please review it before checkout.', {
      statusCode: 409,
      code: 'CHECKOUT_REVALIDATION_FAILED',
      details: warnings,
    });
  }
  if (input.paymentMethod === 'razorpay' && currency !== 'INR') {
    throw new AppError('Razorpay checkout currently supports INR orders only.', {
      statusCode: 409,
      code: 'UNSUPPORTED_PAYMENT_CURRENCY',
    });
  }
  const shippingAddress = await Address.findOne({ _id: input.shippingAddressId, user: user.sub });
  if (!shippingAddress) throw new AppError('The shipping address was not found.', {
    statusCode: 404,
    code: 'ADDRESS_NOT_FOUND',
  });
  const billingAddress = input.billingAddressId
    ? await Address.findOne({ _id: input.billingAddressId, user: user.sub })
    : shippingAddress;
  if (!billingAddress) throw new AppError('The billing address was not found.', {
    statusCode: 404,
    code: 'ADDRESS_NOT_FOUND',
  });
  if (input.paymentMethod === 'cod' && subtotal > env.COD_MAX_ORDER_VALUE) {
    throw new AppError('Cash on Delivery is not available for this order value.', {
      statusCode: 409,
      code: 'COD_LIMIT_EXCEEDED',
    });
  }
  const reservations = await reserveItems(items);
  const seller = await InvoiceSettings.findOne({ active: true }).lean();
  const charges = await calculateCharges(
    subtotal,
    input.paymentMethod,
    shippingAddress.state,
    seller?.sellerAddress?.state,
  );
  const order = new Order({
    orderNumber: `TGS-${Date.now()}-${crypto.randomInt(1000, 10000)}`,
    user: user.sub,
    idempotencyKey,
    items: items.map((item) => ({
      productId: item.product._id,
      sku: item.product.sku,
      name: item.product.name,
      slug: item.product.slug,
      mainImage: item.product.mainImage,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      currency: item.product.currency || 'INR',
    })),
    shippingAddress: snapshotAddress(shippingAddress),
    billingAddress: snapshotAddress(billingAddress),
    subtotal,
    shippingFee: charges.shippingFee,
    packingFee: charges.packingFee,
    codFee: charges.codFee,
    taxAmount: charges.taxAmount,
    taxBreakdown: charges.taxBreakdown,
    appliedCharges: charges.appliedCharges,
    sellerSnapshot: seller,
    invoiceSnapshot: seller,
    grandTotal: subtotal + charges.shippingFee + charges.packingFee + charges.codFee + charges.taxAmount,
    currency,
    paymentMethod: input.paymentMethod,
    orderStatus: input.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment',
    paymentStatus: input.paymentMethod === 'cod' ? 'pending' : 'created',
    reservationExpiresAt: input.paymentMethod === 'razorpay'
      ? new Date(Date.now() + env.PAYMENT_RESERVATION_MINUTES * 60 * 1000)
      : undefined,
    reservations,
  });
  try {
    await order.save();
    if (input.paymentMethod === 'cod') {
      await Cart.updateOne({ user: user.sub }, { $set: { items: [] } });
      return toOrderResponse(order);
    }
    const razorpayOrder = await createRazorpayOrder(order);
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();
    await Cart.updateOne({ user: user.sub }, { $set: { items: [] } });
    return toOrderResponse(order, {
      keyId: env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    });
  } catch (error) {
    await releaseReservations(reservations);
    await Order.deleteOne({ _id: order._id });
    throw error;
  }
}

export async function verifyRazorpayPayment(user, input) {
  const order = await Order.findOne({ _id: input.orderId, user: user.sub });
  if (!order || order.razorpayOrderId !== input.razorpayOrderId) {
    throw new AppError('The payment order was not found.', { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  }
  const signature = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET || '')
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex');
  if (signature !== input.razorpaySignature) {
    throw new AppError('The payment signature is invalid.', { statusCode: 400, code: 'INVALID_PAYMENT_SIGNATURE' });
  }
  order.razorpayPaymentId = input.razorpayPaymentId;
  order.paymentStatus = 'authorized';
  await order.save();
  return toOrderResponse(order);
}

function refundAmountInProgress(order) {
  return (order.refunds || [])
    .filter((refund) => refund.status !== 'failed')
    .reduce((total, refund) => total + refund.amount, 0);
}

function updateRefundFromProvider(order, entity, fallbackStatus) {
  const amount = Number(entity.amount || 0) / 100;
  const status = entity.status || fallbackStatus;
  const existing = order.refunds.find((refund) => refund.refundId === entity.id);
  const values = {
    refundId: entity.id,
    paymentId: entity.payment_id || order.razorpayPaymentId,
    amount,
    currency: entity.currency || order.currency,
    status: ['processed', 'failed', 'created', 'pending'].includes(status) ? status : fallbackStatus,
    createdAt: entity.created_at ? new Date(entity.created_at * 1000) : existing?.createdAt,
    processedAt: entity.processed_at
      ? new Date(entity.processed_at * 1000)
      : status === 'processed' ? (existing?.processedAt || new Date()) : existing?.processedAt,
    notes: entity.notes || existing?.notes || {},
    failure: status === 'failed' ? {
      reason: entity.error_reason || entity.failure_reason,
      description: entity.error_description || entity.failure_description,
      code: entity.error_code,
    } : null,
  };
  if (existing) Object.assign(existing, values);
  else order.refunds.push(values);
  order.refundedAmount = refundAmountInProgress(order);
  const fullyRefunded = order.refundedAmount >= order.grandTotal;
  if (fullyRefunded && status === 'processed') {
    order.paymentStatus = 'refunded';
    order.orderStatus = 'refunded';
  } else if (status === 'processed' && order.paymentStatus !== 'refunded') {
    order.paymentStatus = 'captured';
  }
  order.refund = values;
}

export async function initiateRazorpayRefund(order, input, idempotencyKey) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay refunds are not configured.', { statusCode: 503, code: 'REFUND_PROVIDER_NOT_CONFIGURED' });
  }
  if (order.paymentMethod !== 'razorpay' || order.paymentStatus !== 'captured' || !order.razorpayPaymentId) {
    throw new AppError('A refund can only be created for a captured Razorpay payment.', { statusCode: 409, code: 'REFUND_PAYMENT_NOT_CAPTURED' });
  }
  if (idempotencyKey) {
    const existing = order.refunds.find((refund) => refund.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }
  const available = order.grandTotal - refundAmountInProgress(order);
  if (input.amount > available) {
    throw new AppError('The refund amount exceeds the captured amount still available for refund.', {
      statusCode: 409, code: 'REFUND_AMOUNT_EXCEEDED', details: { capturedAmount: order.grandTotal, alreadyRefunded: refundAmountInProgress(order), availableAmount: available },
    });
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['X-Razorpay-Idempotency'] = idempotencyKey;
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpayPaymentId}/refund`, {
      method: 'POST', headers, body: JSON.stringify({ amount: Math.round(input.amount * 100), notes: input.notes, receipt: order.orderNumber }),
    });
  } catch {
    throw new AppError('Razorpay could not be reached to create the refund. Try again later.', { statusCode: 502, code: 'REFUND_PROVIDER_UNAVAILABLE' });
  }
  if (!response.ok) {
    throw new AppError('Razorpay could not create the refund. Verify the payment and try again.', {
      statusCode: response.status === 400 ? 400 : 502, code: 'REFUND_PROVIDER_ERROR',
    });
  }
  let entity;
  try {
    entity = await response.json();
  } catch {
    throw new AppError('Razorpay returned an unreadable refund response.', { statusCode: 502, code: 'REFUND_PROVIDER_ERROR' });
  }
  updateRefundFromProvider(order, { ...entity, notes: input.notes }, entity.status || 'created');
  const latest = order.refunds[order.refunds.length - 1];
  latest.reason = input.reason;
  latest.notes = input.notes || {};
  latest.idempotencyKey = idempotencyKey;
  await order.save();
  return latest;
}

export async function reconcileRazorpayRefund(order, refundId) {
  const local = order.refunds.find((refund) => refund.refundId === refundId);
  if (!local) throw new AppError('The refund does not belong to this order.', { statusCode: 404, code: 'REFUND_NOT_FOUND' });
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay refunds are not configured.', { statusCode: 503, code: 'REFUND_PROVIDER_NOT_CONFIGURED' });
  }
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1/refunds/${refundId}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}` },
    });
  } catch {
    throw new AppError('Razorpay could not be reached to verify the refund. Try again later.', { statusCode: 502, code: 'REFUND_PROVIDER_UNAVAILABLE' });
  }
  if (!response.ok) throw new AppError('Razorpay could not verify this refund. Try again later.', { statusCode: response.status === 404 ? 404 : 502, code: response.status === 404 ? 'REFUND_NOT_FOUND_AT_PROVIDER' : 'REFUND_PROVIDER_ERROR' });
  let entity;
  try {
    entity = await response.json();
  } catch {
    throw new AppError('Razorpay returned an unreadable refund response.', { statusCode: 502, code: 'REFUND_PROVIDER_ERROR' });
  }
  updateRefundFromProvider(order, entity, entity.status || local.status);
  await order.save();
  return order.refunds.find((refund) => refund.refundId === refundId);
}

export async function handleRazorpayWebhook(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !rawBody || !signature) {
    throw new AppError('The payment webhook could not be verified.', { statusCode: 400, code: 'INVALID_WEBHOOK' });
  }
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  if (expected !== signature) {
    throw new AppError('The payment webhook signature is invalid.', { statusCode: 400, code: 'INVALID_WEBHOOK_SIGNATURE' });
  }
  const event = JSON.parse(rawBody.toString('utf8'));
  const entity = event.payload?.payment?.entity || event.payload?.order?.entity;
  const refundEntity = event.payload?.refund?.entity;
  const razorpayOrderId = entity?.order_id || entity?.id;
  const order = refundEntity?.payment_id
    ? await Order.findOne({ razorpayPaymentId: refundEntity.payment_id })
    : await Order.findOne({ razorpayOrderId });
  if (!order || order.processedWebhookEvents.includes(event.id)) return { received: true };
  if (['payment.captured', 'order.paid'].includes(event.event)) {
    await consumeReservations(order);
    order.paymentStatus = 'captured';
    order.orderStatus = 'confirmed';
    order.razorpayPaymentId = order.razorpayPaymentId || event.payload?.payment?.entity?.id;
    await Cart.updateOne({ user: order.user }, { $set: { items: [] } });
  } else if (event.event === 'payment.failed') {
    await releaseReservations(order.reservations);
    order.reservations.forEach((reservation) => { reservation.status = 'released'; });
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
  } else if (['refund.created', 'refund.processed', 'refund.failed', 'refund.updated', 'refund.speed_changed'].includes(event.event) && refundEntity) {
    updateRefundFromProvider(order, refundEntity, event.event === 'refund.failed' ? 'failed' : event.event === 'refund.processed' ? 'processed' : 'created');
  }
  order.processedWebhookEvents.push(event.id);
  await order.save();
  return { received: true };
}

export async function releaseExpiredReservations() {
  const expiredOrders = await Order.find({
    paymentMethod: 'razorpay',
    paymentStatus: { $in: ['created', 'authorized'] },
    reservationExpiresAt: { $lt: new Date() },
    'reservations.status': 'active',
  });
  for (const order of expiredOrders) {
    await releaseReservations(order.reservations);
    order.reservations.forEach((reservation) => { reservation.status = 'released'; });
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    await order.save();
  }
  return expiredOrders.length;
}

export async function listOrders(user) {
  return Order.find({ user: user.sub }).sort({ createdAt: -1 }).lean();
}

export async function getOrder(user, orderId) {
  const order = await Order.findOne({ _id: orderId, user: user.sub }).lean();
  if (!order) throw new AppError('The order was not found.', { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  return order;
}

export async function cancelOrder(user, orderId) {
  const order = await Order.findOne({ _id: orderId, user: user.sub });
  if (!order) throw new AppError('The order was not found.', { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  if (!['pending_payment', 'confirmed'].includes(order.orderStatus)) {
    throw new AppError('This order can no longer be cancelled.', { statusCode: 409, code: 'ORDER_CANNOT_BE_CANCELLED' });
  }
  await releaseReservations(order.reservations);
  order.reservations.forEach((reservation) => { reservation.status = 'released'; });
  order.orderStatus = 'cancelled';
  if (order.paymentStatus !== 'captured') order.paymentStatus = 'failed';
  await order.save();
  return order;
}
