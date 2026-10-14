import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await ensureDefaultAdmin();
});

beforeEach(async () => {
  await RefreshToken.deleteMany({});
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('Admin authentication', () => {
  it('logs in and returns a 24-hour access token and 30-day refresh token', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'password',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user: {
          email: 'admin@example.com',
          role: 'admin',
        },
        accessTokenExpiresIn: '24h',
      },
    });
    expect(response.body.data.accessToken).toBeTypeOf('string');
    expect(response.body.data.refreshToken).toBeTypeOf('string');
  });

  it('rotates the refresh token and rejects the old token', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'password',
    });
    const originalRefreshToken = loginResponse.body.data.refreshToken;

    const refreshResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: originalRefreshToken,
    });
    const rotatedRefreshToken = refreshResponse.body.data.refreshToken;

    expect(refreshResponse.status).toBe(200);
    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

    const reuseResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: originalRefreshToken,
    });

    expect(reuseResponse.status).toBe(401);
    expect(reuseResponse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes the refresh token on logout', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'password',
    });
    const refreshToken = loginResponse.body.data.refreshToken;

    const logoutResponse = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    const refreshAfterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body.data.message).toBe('You have been logged out successfully.');
    expect(refreshAfterLogout.status).toBe(401);
  });
});
