import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { RefreshToken } from '../../models/refresh-token.model.js';
import { OtpChallenge } from '../../models/otp-challenge.model.js';
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

function hashOtp(code) {
  return createHmac('sha256', env.ACCESS_TOKEN_SECRET).update(code).digest('hex');
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

async function createRefreshToken(userId, rememberMe = false) {
  const token = randomBytes(64).toString('hex');
  const ttlDays = rememberMe ? env.REFRESH_TOKEN_TTL_DAYS : 1;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    tokenHash: hashRefreshToken(token),
    user: userId,
    expiresAt,
    rememberMe,
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
      mobile: user.mobile,
      name: user.name,
      role: user.role,
    },
  };
}

export async function createUserSession(user, rememberMe = false) {
  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user._id, rememberMe);
  return tokenResponse(user, accessToken, refreshToken);
}

async function sendOtp(mobile, code) {
  if (!env.TWO_FACTOR_API_KEY) {
    throw new AppError('OTP delivery is not configured.', {
      statusCode: 503,
      code: 'OTP_PROVIDER_NOT_CONFIGURED',
    });
  }

  const response = await fetch(
    `https://2factor.in/API/V1/${env.TWO_FACTOR_API_KEY}/SMS/${encodeURIComponent(mobile)}/${code}`,
  );
  if (!response.ok) {
    throw new AppError('The OTP provider could not send the verification code.', {
      statusCode: 502,
      code: 'OTP_PROVIDER_ERROR',
    });
  }
}

export async function requestUserOtp({ mobile, email, name, password, rememberMe }) {
  const code = randomInt(100000, 1000000).toString();
  await sendOtp(mobile, code);
  await OtpChallenge.deleteMany({ mobile, consumedAt: null });
  await OtpChallenge.create({
    mobile,
    email: email?.toLowerCase(),
    name,
    passwordHash: password ? await bcrypt.hash(password, 12) : undefined,
    rememberMe,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000),
  });

  return {
    mobile,
    expiresInSeconds: env.OTP_EXPIRES_MINUTES * 60,
    message: 'A verification code has been sent to your mobile number.',
  };
}

export async function verifyUserOtp({ mobile, otp, rememberMe }) {
  const challenge = await OtpChallenge.findOne({
    mobile,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!challenge || challenge.attempts >= 5 || challenge.codeHash !== hashOtp(otp)) {
    if (challenge) {
      challenge.attempts += 1;
      await challenge.save();
    }
    throw new AppError('The OTP is invalid or has expired.', {
      statusCode: 401,
      code: 'INVALID_OTP',
    });
  }

  challenge.consumedAt = new Date();
  challenge.verifiedAt = new Date();
  await challenge.save();

  const existingUser = await User.findOne({ mobile });
  if (existingUser) {
    return {
      ...(await createUserSession(existingUser, rememberMe || challenge.rememberMe)),
      registrationRequired: false,
    };
  }

  const registrationToken = jwt.sign(
    { sub: challenge._id.toString(), type: 'registration' },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' },
  );
  return {
    registrationRequired: true,
    registrationToken,
    mobile,
    email: challenge.email,
    name: challenge.name,
  };
}

export async function completeUserRegistration({ registrationToken, role, email }) {
  let payload;
  try {
    payload = jwt.verify(registrationToken, env.ACCESS_TOKEN_SECRET);
  } catch {
    throw new AppError('The registration session is invalid or expired.', {
      statusCode: 401,
      code: 'INVALID_REGISTRATION_TOKEN',
    });
  }
  if (typeof payload !== 'object' || payload.type !== 'registration') {
    if (typeof payload === 'object' && payload.type === 'social-registration') {
      const identityQuery = payload.provider === 'facebook'
        ? {
            $or: [
              { facebookId: payload.providerId },
              ...(payload.email ? [{ email: payload.email }] : []),
            ],
          }
        : { email: payload.email };
      const existingUser = await User.findOne(identityQuery);
      if (existingUser) {
        if (payload.provider === 'facebook' && !existingUser.facebookId) {
          existingUser.facebookId = payload.providerId;
          await existingUser.save();
        }
        return createUserSession(existingUser);
      }
      const user = await User.create({
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.provider === 'facebook' ? { facebookId: payload.providerId } : {}),
        role,
        name: payload.name,
        isVerified: true,
      });
      return createUserSession(user);
    }
    throw new AppError('The registration session is invalid.', {
      statusCode: 401,
      code: 'INVALID_REGISTRATION_TOKEN',
    });
  }

  const challenge = await OtpChallenge.findOne({
    _id: payload.sub,
    verifiedAt: { $ne: null },
    role: null,
  });
  if (!challenge) {
    throw new AppError('The registration session is invalid or already completed.', {
      statusCode: 409,
      code: 'REGISTRATION_ALREADY_COMPLETED',
    });
  }

  const registrationEmail = challenge.email || email?.toLowerCase();
  if (!registrationEmail) {
    throw new AppError('Email is required to complete registration.', {
      statusCode: 400,
      code: 'REGISTRATION_EMAIL_REQUIRED',
    });
  }
  const existingEmailUser = await User.findOne({ email: registrationEmail }).lean();
  if (existingEmailUser) {
    throw new AppError('An account already exists with this email address.', {
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
    });
  }

  const user = await User.create({
    mobile: challenge.mobile,
    email: registrationEmail,
    role,
    name: challenge.name,
    passwordHash: challenge.passwordHash,
    isVerified: true,
  });
  challenge.role = role;
  await challenge.save();
  return createUserSession(user, challenge.rememberMe);
}

export async function loginUserWithPassword({ identifier, password, rememberMe }) {
  const normalizedIdentifier = identifier.includes('@') ? identifier.toLowerCase() : identifier;
  const user = await User.findOne({
    role: { $in: ['customer', 'merchant'] },
    $or: [{ email: normalizedIdentifier }, { mobile: normalizedIdentifier }],
  }).select('+passwordHash');

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('The login details are incorrect.', {
      statusCode: 401,
      code: 'INVALID_USER_CREDENTIALS',
    });
  }

  return createUserSession(user, rememberMe);
}

export async function createGuestSession() {
  const accessToken = jwt.sign(
    { sub: randomUUID(), role: 'guest', type: 'guest' },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: '24h' },
  );
  return { accessToken, accessTokenExpiresIn: '24h', user: { role: 'guest' } };
}

export function getSocialAuthorizationUrl(provider, role) {
  if (!['google', 'facebook'].includes(provider)) {
    throw new AppError('This social sign-in provider is not supported.', {
      statusCode: 404,
      code: 'SOCIAL_PROVIDER_NOT_SUPPORTED',
    });
  }
  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      throw new AppError('Google sign-in is not configured.', {
        statusCode: 503,
        code: 'GOOGLE_AUTH_NOT_CONFIGURED',
      });
    }
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
    });
    if (role) params.set('state', role);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_REDIRECT_URI) {
    throw new AppError('Facebook sign-in is not configured.', {
      statusCode: 503,
      code: 'FACEBOOK_AUTH_NOT_CONFIGURED',
    });
  }
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: env.FACEBOOK_REDIRECT_URI,
    response_type: 'code',
  });
  if (env.FACEBOOK_CONFIG_ID) {
    params.set('config_id', env.FACEBOOK_CONFIG_ID);
  } else {
    params.set('scope', 'public_profile,email');
  }
  if (role) params.set('state', role);
  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
}

export async function loginWithSocial(provider, code, role, rememberMe) {
  if (!['google', 'facebook'].includes(provider)) {
    throw new AppError('This social sign-in provider is not supported.', {
      statusCode: 404,
      code: 'SOCIAL_PROVIDER_NOT_SUPPORTED',
    });
  }
  let email;
  let name;
  let providerId;
  if (provider === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new AppError('Google sign-in is not configured.', { statusCode: 503, code: 'GOOGLE_AUTH_NOT_CONFIGURED' });
    }
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new AppError('Google sign-in could not be completed.', { statusCode: 502, code: 'GOOGLE_AUTH_ERROR' });
    }
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json();
    email = profile.email;
    name = profile.name;
    providerId = profile.sub;
  } else {
    if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET || !env.FACEBOOK_REDIRECT_URI) {
      throw new AppError('Facebook sign-in is not configured.', { statusCode: 503, code: 'FACEBOOK_AUTH_NOT_CONFIGURED' });
    }
    const tokenUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
    tokenUrl.search = new URLSearchParams({
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: env.FACEBOOK_REDIRECT_URI,
      code,
    });
    const tokenResponse = await fetch(tokenUrl);
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new AppError('Facebook sign-in could not be completed.', { statusCode: 502, code: 'FACEBOOK_AUTH_ERROR' });
    }
    const profileResponse = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(tokens.access_token)}`,
    );
    const profile = await profileResponse.json();
    email = profile.email;
    name = profile.name;
    providerId = profile.id;
  }
  if (!email && !providerId) {
    throw new AppError('The social provider did not return a usable account identifier.', {
      statusCode: 400,
      code: 'SOCIAL_ACCOUNT_IDENTIFIER_REQUIRED',
    });
  }
  const existingUser = await User.findOne({
    ...(provider === 'facebook'
      ? {
          $or: [
            { facebookId: providerId },
            ...(email ? [{ email: email.toLowerCase() }] : []),
          ],
        }
      : { email: email.toLowerCase() }),
    ...(role ? { role } : { role: { $in: ['customer', 'merchant'] } }),
  });
  if (existingUser) {
    if (provider === 'facebook' && !existingUser.facebookId) {
      existingUser.facebookId = providerId;
      await existingUser.save();
    }
    return createUserSession(existingUser, rememberMe);
  }

  const registrationToken = jwt.sign(
    { type: 'social-registration', provider, providerId, email: email?.toLowerCase(), name },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' },
  );
  return { registrationRequired: true, registrationToken, email, name };
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
