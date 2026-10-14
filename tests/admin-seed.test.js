import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { User } from '../src/models/user.model.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('ensureDefaultAdmin', () => {
  it('creates the default admin with a hashed password', async () => {
    await ensureDefaultAdmin();

    const admin = await User.findOne({ email: 'admin@example.com' }).select('+passwordHash').lean();

    expect(admin).toMatchObject({
      email: 'admin@example.com',
      role: 'admin',
    });
    expect(admin.passwordHash).not.toBe('password');
  });

  it('skips creation when the default admin already exists', async () => {
    await ensureDefaultAdmin();

    expect(await User.countDocuments({ email: 'admin@example.com' })).toBe(1);
  });
});
