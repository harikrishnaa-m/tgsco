import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { SocialLoginHandoff } from '../src/models/social-login-handoff.model.js';
import { SocialOAuthState } from '../src/models/social-oauth-state.model.js';
import { User } from '../src/models/user.model.js';
import {
  consumeSocialOAuthState,
  createSocialLoginHandoff,
} from '../src/modules/auth/auth.service.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await ensureDefaultAdmin();
});

beforeEach(async () => {
  await Promise.all([
    RefreshToken.deleteMany({}),
    SocialLoginHandoff.deleteMany({}),
    SocialOAuthState.deleteMany({}),
    User.deleteMany({
      email: { $in: ['social-login@example.com', 'social-registration@example.com'] },
    }),
  ]);
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

describe('Social authentication handoff', () => {
  it('exchanges a single-use code for the existing user session', async () => {
    const user = await User.create({
      email: 'social-login@example.com',
      name: 'Social User',
      role: 'customer',
      isVerified: true,
    });
    const code = await createSocialLoginHandoff({ user }, true);

    const response = await request(app)
      .post('/api/v1/auth/ecommerce/social/exchange')
      .send({ code });
    const replayResponse = await request(app)
      .post('/api/v1/auth/ecommerce/social/exchange')
      .send({ code });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      user: {
        id: user._id.toString(),
        email: 'social-login@example.com',
        role: 'customer',
      },
    });
    expect(response.body.data.accessToken).toBeTypeOf('string');
    expect(response.body.data.refreshToken).toBeTypeOf('string');
    expect(replayResponse.status).toBe(401);
    expect(replayResponse.body.error.code).toBe('INVALID_SOCIAL_AUTH_CODE');
  });

  it('preserves social registration when exchanging a new-account handoff', async () => {
    const code = await createSocialLoginHandoff(
      {
        registration: {
          provider: 'google',
          providerId: 'google-social-registration',
          email: 'social-registration@example.com',
          name: 'New Social User',
        },
      },
      false,
    );

    const exchangeResponse = await request(app)
      .post('/api/v1/auth/ecommerce/social/exchange')
      .send({ code });
    const registrationResponse = await request(app)
      .post('/api/v1/auth/ecommerce/select-role')
      .send({
        registrationToken: exchangeResponse.body.data.registrationToken,
        role: 'merchant',
      });

    expect(exchangeResponse.status).toBe(200);
    expect(exchangeResponse.body.data).toMatchObject({
      registrationRequired: true,
      email: 'social-registration@example.com',
      name: 'New Social User',
    });
    expect(exchangeResponse.body.data.registrationToken).toBeTypeOf('string');
    expect(registrationResponse.status).toBe(200);
    expect(registrationResponse.body.data.user.role).toBe('merchant');
  });

  it('consumes OAuth state once and rejects reuse', async () => {
    const state = 'social-oauth-state';
    await SocialOAuthState.create({
      stateHash: createHash('sha256').update(state).digest('hex'),
      provider: 'google',
      role: 'merchant',
      rememberMe: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(consumeSocialOAuthState('google', state)).resolves.toMatchObject({
      role: 'merchant',
      rememberMe: true,
    });
    await expect(consumeSocialOAuthState('google', state)).rejects.toMatchObject({
      code: 'INVALID_SOCIAL_OAUTH_STATE',
    });
  });

  it('rejects expired handoff codes', async () => {
    const user = await User.create({
      email: 'social-login@example.com',
      name: 'Social User',
      role: 'customer',
    });
    const code = await createSocialLoginHandoff({ user }, false);
    const codeHash = createHash('sha256').update(code).digest('hex');
    await SocialLoginHandoff.updateOne(
      { codeHash },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );

    const response = await request(app)
      .post('/api/v1/auth/ecommerce/social/exchange')
      .send({ code });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_SOCIAL_AUTH_CODE');
  });
});
