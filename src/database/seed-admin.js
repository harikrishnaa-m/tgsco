import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { User } from '../models/user.model.js';

const PASSWORD_SALT_ROUNDS = 12;

export async function ensureDefaultAdmin() {
  const existingAdmin = await User.findOne({ email: env.DEFAULT_ADMIN_EMAIL }).select('_id').lean();

  if (existingAdmin) {
    logger.info({ email: env.DEFAULT_ADMIN_EMAIL }, 'Default admin already exists; skipped');
    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, PASSWORD_SALT_ROUNDS);

  try {
    await User.create({
      email: env.DEFAULT_ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    logger.info({ email: env.DEFAULT_ADMIN_EMAIL }, 'Default admin already exists; skipped');
    return;
  }

  logger.info({ email: env.DEFAULT_ADMIN_EMAIL }, 'Default admin created');
}
