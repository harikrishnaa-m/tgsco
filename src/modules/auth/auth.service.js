import { createHash, randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { RefreshToken } from '../../models/refresh-token.model.js';
import { User } from '../../models/user.model.js';

function invalidCredentialsError() {
  return new AppError('The email or password is incorrect.', {
    statusCode: 401,
    code: 'INVALID_CREDENTIALS',
  });
}

function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      type: 'access',
    },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN },
  );
}

async function createRefreshToken(userId) {
  const token = randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    tokenHash: hashRefreshToken(token),
    user: userId,
    expiresAt,
  });

  return { token, expiresAt };
}

function tokenResponse(user, accessToken, refreshToken) {
  return {
    accessToken,
    refreshToken: refreshToken.token,
    accessTokenExpiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
  };
}

export async function loginAdmin(email, password) {
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || user.role !== 'admin' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw invalidCredentialsError();
  }

  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user._id);

  return tokenResponse(user, accessToken, refreshToken);
}

export async function refreshAdminSession(token) {
  const storedToken = await RefreshToken.findOne({
    tokenHash: hashRefreshToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).populate('user');

  if (!storedToken || !storedToken.user || storedToken.user.role !== 'admin') {
    throw new AppError('Your refresh session is invalid or has expired. Please sign in again.', {
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  storedToken.revokedAt = new Date();
  await storedToken.save();

  const accessToken = createAccessToken(storedToken.user);
  const refreshToken = await createRefreshToken(storedToken.user._id);

  return tokenResponse(storedToken.user, accessToken, refreshToken);
}

export async function logoutAdmin(token) {
  await RefreshToken.updateOne(
    {
      tokenHash: hashRefreshToken(token),
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    },
  );
}
