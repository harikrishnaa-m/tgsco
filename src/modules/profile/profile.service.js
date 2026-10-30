import bcrypt from 'bcryptjs';

import { AppError } from '../../errors/app-error.js';
import { RefreshToken } from '../../models/refresh-token.model.js';
import { User } from '../../models/user.model.js';
import { notifyUser } from '../notifications/notifications.service.js';

const profileFields = 'email mobile name role isVerified createdAt updatedAt';

function formatProfile(user) {
  return {
    id: user._id,
    email: user.email,
    mobile: user.mobile,
    name: user.name,
    role: user.role,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function findAccount(userId) {
  const user = await User.findById(userId);
  if (!user || !['admin', 'customer', 'merchant'].includes(user.role)) {
    throw new AppError('The account was not found.', {
      statusCode: 404,
      code: 'ACCOUNT_NOT_FOUND',
    });
  }
  return user;
}

async function findAccountWithPassword(userId) {
  const user = await User.findById(userId).select(`+passwordHash ${profileFields}`);
  if (!user || !['admin', 'customer', 'merchant'].includes(user.role)) {
    throw new AppError('The account was not found.', {
      statusCode: 404,
      code: 'ACCOUNT_NOT_FOUND',
    });
  }
  if (!user.passwordHash) {
    throw new AppError('Set a password before changing protected account details.', {
      statusCode: 409,
      code: 'PASSWORD_NOT_SET',
    });
  }
  return user;
}

async function verifyCurrentPassword(user, currentPassword) {
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError('The current password is incorrect.', {
      statusCode: 401,
      code: 'CURRENT_PASSWORD_INVALID',
    });
  }
}

async function assertUniqueContact(userId, email, mobile) {
  const conditions = [];
  if (email) conditions.push({ email });
  if (mobile) conditions.push({ mobile });
  if (!conditions.length) return;

  const existing = await User.findOne({
    _id: { $ne: userId },
    $or: conditions,
  }).select('email mobile');
  if (!existing) return;
  if (email && existing.email === email) {
    throw new AppError('An account already uses this email address.', {
      statusCode: 409,
      code: 'EMAIL_ALREADY_IN_USE',
    });
  }
  throw new AppError('An account already uses this mobile number.', {
    statusCode: 409,
    code: 'MOBILE_ALREADY_IN_USE',
  });
}

export async function getProfile(user) {
  return formatProfile(await findAccount(user.sub));
}

export async function updateProfile(user, input) {
  const account = await findAccountWithPassword(user.sub);
  await verifyCurrentPassword(account, input.currentPassword);

  const email = input.email?.toLowerCase();
  await assertUniqueContact(account._id, email, input.mobile);
  const updatedFields = ['email', 'mobile', 'name'].filter((field) => input[field] !== undefined);
  if (email !== undefined) account.email = email;
  if (input.mobile !== undefined) account.mobile = input.mobile;
  if (input.name !== undefined) account.name = input.name;

  try {
    await account.save();
  } catch (error) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      throw new AppError(
        `An account already uses this ${field === 'email' ? 'email address' : 'mobile number'}.`,
        {
          statusCode: 409,
          code: field === 'email' ? 'EMAIL_ALREADY_IN_USE' : 'MOBILE_ALREADY_IN_USE',
        },
      );
    }
    throw error;
  }
  await notifyUser(account._id, account.role, {
    type: 'account.profile_updated',
    title: 'Profile updated',
    message: 'Your account profile details were updated.',
    data: { updatedFields },
    eventKey: `profile-updated:${account._id}:${account.updatedAt.toISOString()}`,
  });
  return formatProfile(account);
}

export async function updatePassword(user, input) {
  const account = await findAccountWithPassword(user.sub);
  await verifyCurrentPassword(account, input.currentPassword);
  account.passwordHash = await bcrypt.hash(input.newPassword, 12);
  await account.save();
  await RefreshToken.deleteMany({ user: account._id });
  await notifyUser(account._id, account.role, {
    type: 'account.password_changed',
    title: 'Password changed',
    message: 'Your account password was changed. If you did not do this, contact support.',
    data: {},
    eventKey: `password-changed:${account._id}:${account.updatedAt.toISOString()}`,
  });
  return {
    message: 'Password updated successfully. Please sign in again on other devices.',
    profile: formatProfile(account),
  };
}
