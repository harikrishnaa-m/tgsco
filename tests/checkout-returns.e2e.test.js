import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { createUserSession } from '../src/modules/auth/auth.service.js';
import { Address } from '../src/models/address.model.js';
import { Cart } from '../src/models/cart.model.js';
import { CatalogProduct } from '../src/models/catalog-product.model.js';
import { Order } from '../src/models/order.model.js';
import { RefundMethod } from '../src/models/refund-method.model.js';
import { Return } from '../src/models/return.model.js';
import { User } from '../src/models/user.model.js';
import {
  handleRazorpayWebhook,
  verifyRazorpayPayment,
} from '../src/modules/checkout/checkout.service.js';

let mongoServer;
let customer;
let customerToken;
let adminToken;
let product;
let address;

async function createUser(role, email) {
  return User.create({
    email,
    name: role === 'admin' ? 'Test Admin' : 'Test Customer',
    mobile: role === 'admin' ? undefined : `9${String(Date.now()).slice(-9)}`,
    role,
    isVerified: true,
  });
}

async function createCodOrder() {
  await Cart.create({
    user: customer._id,
    items: [{ product: product._id, quantity: 1 }],
  });

  const summary = await request(app)
    .get('/api/v1/checkout/summary')
    .set('Authorization', `Bearer ${customerToken}`);
  expect(summary.status).toBe(200);
  expect(summary.body.data.canCheckout).toBe(true);

  const response = await request(app)
    .post('/api/v1/checkout/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .set('Idempotency-Key', `checkout-${new mongoose.Types.ObjectId()}`)
    .send({
      shippingAddressId: address._id.toString(),
      paymentMethod: 'cod',
    });

  expect(response.status).toBe(201);
  return response.body.data;
}

async function moveOrderToDelivered(orderId) {
  for (const status of ['processing', 'shipped', 'delivered']) {
    const response = await request(app)
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status });
    expect(response.status).toBe(200);
  }
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await ensureDefaultAdmin();
  const admin = await User.findOne({ email: 'admin@example.com' });
  adminToken = (await createUserSession(admin, true)).accessToken;
});

beforeEach(async () => {
  await Promise.all([
    Address.deleteMany({}),
    Cart.deleteMany({}),
    CatalogProduct.deleteMany({}),
    Order.deleteMany({}),
    RefundMethod.deleteMany({}),
    Return.deleteMany({}),
    User.deleteMany({ email: { $ne: 'admin@example.com' } }),
  ]);

  customer = await createUser('customer', `customer-${new mongoose.Types.ObjectId()}@example.com`);
  customerToken = (await createUserSession(customer, true)).accessToken;
  product = await CatalogProduct.create({
    name: 'Test Handloom Saree',
    slug: `test-handloom-saree-${new mongoose.Types.ObjectId()}`,
    sku: `TEST-${Date.now()}`,
    category: new mongoose.Types.ObjectId(),
    categorySlug: 'sarees',
    price: 1000,
    stockQuantity: 5,
    reservedQuantity: 0,
  });
  address = await Address.create({
    user: customer._id,
    label: 'home',
    recipientName: 'Test Customer',
    mobile: '9876543210',
    addressLine1: '10 Test Street',
    locality: 'Test Nagar',
    city: 'Kochi',
    district: 'Ernakulam',
    state: 'Kerala',
    stateCode: 'KL',
    postalCode: '682001',
    country: 'India',
  });
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('checkout, COD refunds, and returns', () => {
  it('creates a COD order, completes a return, and records the admin refund reference', async () => {
    const order = await createCodOrder();
    expect(order.paymentMethod).toBe('cod');
    expect(order.orderStatus).toBe('confirmed');
    expect((await CatalogProduct.findById(product._id)).reservedQuantity).toBe(1);

    await moveOrderToDelivered(order._id);

    const methodResponse = await request(app)
      .post('/api/v1/refund-methods')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        method: 'upi',
        upiId: 'testcustomer@upi',
        confirmUpiId: 'testcustomer@upi',
        isDefault: true,
      });
    expect(methodResponse.status).toBe(201);
    expect(methodResponse.body.data.upiId).toBe('testcustomer@upi');
    const refundMethodId = methodResponse.body.data._id;

    const returnResponse = await request(app)
      .post(`/api/v1/orders/${order._id}/returns`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ productId: product._id.toString(), quantity: 1 }],
        reason: 'Product damaged',
        pickupAddressId: address._id.toString(),
        refundMethodId,
      });
    expect(returnResponse.status).toBe(201);
    expect(returnResponse.body.data.refundMethod.method).toBe('upi');

    const returnId = returnResponse.body.data._id;
    for (const status of [
      'approved',
      'pickup_pending',
      'received',
      'inspection_pending',
      'approved_for_refund',
      'refund_pending',
    ]) {
      const response = await request(app)
        .patch(`/api/v1/admin/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status });
      expect(response.status).toBe(200);
    }

    const missingDetails = await request(app)
      .patch(`/api/v1/admin/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'refunded' });
    expect(missingDetails.status).toBe(400);
    expect(missingDetails.body.error.code).toBe('COD_REFUND_DETAILS_REQUIRED');

    const refundResponse = await request(app)
      .patch(`/api/v1/admin/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'refunded',
        refundMethod: 'upi',
        refundReference: 'UPI-TEST-123',
        refundNotes: 'COD refund completed',
      });
    expect(refundResponse.status).toBe(200);
    expect(refundResponse.body.data.status).toBe('refunded');
    expect(refundResponse.body.data.refund).toMatchObject({
      status: 'processed',
      method: 'upi',
      reference: 'UPI-TEST-123',
    });
  });

  describe('Razorpay payment confirmation', () => {
    it('confirms a captured payment from its webhook without frontend verification', async () => {
      const previousWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
      const previousKeySecret = env.RAZORPAY_KEY_SECRET;
      env.RAZORPAY_WEBHOOK_SECRET = 'test-razorpay-webhook-secret';

      try {
        await CatalogProduct.updateOne({ _id: product._id }, { $set: { reservedQuantity: 1 } });
        const order = await Order.create({
          orderNumber: `TGS-WEBHOOK-${new mongoose.Types.ObjectId()}`,
          user: customer._id,
          items: [
            {
              productId: product._id,
              sku: product.sku,
              name: product.name,
              slug: product.slug,
              quantity: 1,
              unitPrice: 1000,
              lineTotal: 1000,
              currency: 'INR',
            },
          ],
          shippingAddress: {
            addressId: address._id,
            recipientName: address.recipientName,
            mobile: address.mobile,
            addressLine1: address.addressLine1,
            locality: address.locality,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
          },
          billingAddress: {
            addressId: address._id,
            recipientName: address.recipientName,
            mobile: address.mobile,
            addressLine1: address.addressLine1,
            locality: address.locality,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
          },
          subtotal: 1000,
          grandTotal: 1000,
          currency: 'INR',
          paymentMethod: 'razorpay',
          orderStatus: 'pending_payment',
          paymentStatus: 'created',
          razorpayOrderId: 'order_webhook_without_verify',
          reservations: [{ productId: product._id, quantity: 1, status: 'active' }],
        });

        const rawBody = Buffer.from(
          JSON.stringify({
            entity: 'event',
            event: 'payment.captured',
            payload: {
              payment: {
                entity: {
                  id: 'pay_webhook_without_verify',
                  order_id: order.razorpayOrderId,
                  status: 'captured',
                  amount: 100000,
                  currency: 'INR',
                },
              },
            },
          }),
        );
        const signature = crypto
          .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
          .update(rawBody)
          .digest('hex');

        await handleRazorpayWebhook(rawBody, signature);

        const confirmedOrder = await Order.findById(order._id);
        const updatedProduct = await CatalogProduct.findById(product._id);
        expect(confirmedOrder.paymentStatus).toBe('captured');
        expect(confirmedOrder.orderStatus).toBe('confirmed');
        expect(confirmedOrder.razorpayPaymentId).toBe('pay_webhook_without_verify');
        expect(confirmedOrder.reservations[0].status).toBe('consumed');
        expect(confirmedOrder.processedWebhookEvents).toHaveLength(1);
        expect(confirmedOrder.processedWebhookEvents[0]).toMatch(/^[a-f\d]{64}$/);
        expect(updatedProduct.stockQuantity).toBe(4);
        expect(updatedProduct.reservedQuantity).toBe(0);

        await handleRazorpayWebhook(rawBody, signature);
        const productAfterDuplicate = await CatalogProduct.findById(product._id);
        expect(productAfterDuplicate.stockQuantity).toBe(4);
        expect(productAfterDuplicate.reservedQuantity).toBe(0);

        env.RAZORPAY_KEY_SECRET = 'test-razorpay-key-secret';
        const razorpayOrderId = order.razorpayOrderId;
        const razorpayPaymentId = 'pay_webhook_without_verify';
        const razorpaySignature = crypto
          .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest('hex');
        await verifyRazorpayPayment(
          { sub: customer._id.toString() },
          {
            orderId: order._id.toString(),
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
          },
        );

        const orderAfterVerification = await Order.findById(order._id);
        expect(orderAfterVerification.paymentStatus).toBe('captured');
        expect(orderAfterVerification.orderStatus).toBe('confirmed');
      } finally {
        env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
        env.RAZORPAY_KEY_SECRET = previousKeySecret;
      }
    });
  });

  it('rejects mismatched refund confirmations and releases stock on cancellation', async () => {
    const invalidMethod = await request(app)
      .post('/api/v1/refund-methods')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        method: 'bank_transfer',
        accountHolderName: 'Test Customer',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789013',
        ifscCode: 'HDFC0001234',
        confirmIfscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
        branchName: 'Kochi',
        accountType: 'savings',
      });
    expect(invalidMethod.status).toBe(400);
    expect(invalidMethod.body.error.code).toBe('INVALID_RETURN_REQUEST');

    const order = await createCodOrder();
    const cancelResponse = await request(app)
      .post(`/api/v1/checkout/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Customer changed their mind' });
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.data.orderStatus).toBe('cancelled');
    expect((await CatalogProduct.findById(product._id)).reservedQuantity).toBe(0);
  });
});
