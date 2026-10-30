import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { Notification } from '../src/models/notification.model.js';
import { User } from '../src/models/user.model.js';
import { createUserSession } from '../src/modules/auth/auth.service.js';

let mongoServer;
let customer;
let customerToken;
let otherCustomerToken;
let notification;

async function createCustomer(email) {
  const user = await User.create({ email, role: 'customer', name: email, isVerified: true });
  return { user, accessToken: (await createUserSession(user)).accessToken };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await Promise.all([Notification.deleteMany({}), User.deleteMany({})]);
  const created = await createCustomer('notifications-customer@example.com');
  const other = await createCustomer('notifications-other@example.com');
  customer = created.user;
  customerToken = created.accessToken;
  otherCustomerToken = other.accessToken;
  notification = await Notification.create({
    recipient: customer._id,
    recipientRole: 'customer',
    type: 'order.created',
    title: 'Order placed',
    message: 'Your order has been placed.',
    data: { orderId: 'order-1' },
    eventKey: 'order-created:order-1',
  });
  await Notification.create({
    recipient: customer._id,
    recipientRole: 'customer',
    type: 'payment.captured',
    title: 'Payment successful',
    message: 'Your payment was successful.',
    data: {},
    eventKey: 'payment-captured:order-1',
    readAt: new Date(),
  });
  await Notification.create({
    recipient: (await User.findOne({ email: 'notifications-other@example.com' }))._id,
    recipientRole: 'customer',
    type: 'order.created',
    title: 'Another order',
    message: 'This belongs to another account.',
    data: {},
    eventKey: 'order-created:other',
  });
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('notification inbox', () => {
  it('lists only the signed-in user notifications with pagination and unread count', async () => {
    const response = await request(app)
      .get('/api/v1/notifications?status=unread&page=1&limit=10')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      total: 1,
      unread: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]._id).toBe(notification._id.toString());
  });

  it('reports unread count and marks one notification read', async () => {
    const countResponse = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${customerToken}`);
    const readResponse = await request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(countResponse.body.data.unread).toBe(1);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.data.readAt).toBeTruthy();
  });

  it('prevents reading or deleting another account notification', async () => {
    const response = await request(app)
      .patch(`/api/v1/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${otherCustomerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  });

  it('marks all notifications read and deletes only read notifications', async () => {
    const markResponse = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${customerToken}`);
    const deleteResponse = await request(app)
      .delete('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(markResponse.body.data.modifiedCount).toBe(1);
    expect(deleteResponse.body.data.deletedCount).toBe(2);
    expect(await Notification.countDocuments({ recipient: customer._id })).toBe(0);
  });
});
