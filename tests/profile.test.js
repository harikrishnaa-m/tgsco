import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { createUserSession } from '../src/modules/auth/auth.service.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { User } from '../src/models/user.model.js';

let mongoServer;
let customer;
let merchant;
let admin;
let tokens;

async function createAccount(role, email, mobile) {
  return User.create({
    role,
    email,
    mobile,
    name: `${role} user`,
    passwordHash: await bcrypt.hash('OldPassword123!', 12),
    isVerified: true,
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await RefreshToken.deleteMany({});
  await User.deleteMany({});
  customer = await createAccount('customer', 'customer@example.com', '+919876543210');
  merchant = await createAccount('merchant', 'merchant@example.com', '+919876543211');
  admin = await createAccount('admin', 'admin@example.com', '+919876543212');
  tokens = {
    customer: (await createUserSession(customer, true)).accessToken,
    merchant: (await createUserSession(merchant, true)).accessToken,
    admin: (await createUserSession(admin, true)).accessToken,
  };
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('Profile endpoints', () => {
  it('returns profile details for customer, merchant, and admin accounts', async () => {
    for (const role of ['customer', 'merchant', 'admin']) {
      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${tokens[role]}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        role,
        email: `${role}@example.com`,
        name: `${role} user`,
      });
      expect(response.body.data.passwordHash).toBeUndefined();
    }
  });

  it('requires the current password for email and mobile updates', async () => {
    const invalid = await request(app)
      .patch('/api/v1/profile')
      .set('Authorization', `Bearer ${tokens.customer}`)
      .send({
        currentPassword: 'WrongPassword123!',
        email: 'new-customer@example.com',
        mobile: '+919876543299',
      });

    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('CURRENT_PASSWORD_INVALID');

    const valid = await request(app)
      .patch('/api/v1/profile')
      .set('Authorization', `Bearer ${tokens.customer}`)
      .send({
        currentPassword: 'OldPassword123!',
        email: 'new-customer@example.com',
        mobile: '+919876543299',
      });

    expect(valid.status).toBe(200);
    expect(valid.body.data).toMatchObject({
      email: 'new-customer@example.com',
      mobile: '+919876543299',
    });
  });

  it('rejects duplicate contact details and validates password changes', async () => {
    const duplicate = await request(app)
      .patch('/api/v1/profile')
      .set('Authorization', `Bearer ${tokens.customer}`)
      .send({
        currentPassword: 'OldPassword123!',
        email: 'merchant@example.com',
      });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_IN_USE');

    const mismatch = await request(app)
      .patch('/api/v1/profile/password')
      .set('Authorization', `Bearer ${tokens.merchant}`)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
        confirmNewPassword: 'DifferentPassword123!',
      });

    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('INVALID_PROFILE_REQUEST');

    const changed = await request(app)
      .patch('/api/v1/profile/password')
      .set('Authorization', `Bearer ${tokens.merchant}`)
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
        confirmNewPassword: 'NewPassword123!',
      });

    expect(changed.status).toBe(200);
    expect(changed.body.data.message).toContain('Password updated successfully');

    const oldPassword = await request(app)
      .post('/api/v1/auth/ecommerce/password-login')
      .send({ identifier: 'merchant@example.com', password: 'OldPassword123!' });
    const newPassword = await request(app)
      .post('/api/v1/auth/ecommerce/password-login')
      .send({ identifier: 'merchant@example.com', password: 'NewPassword123!' });

    expect(oldPassword.status).toBe(401);
    expect(newPassword.status).toBe(200);
  });
});
