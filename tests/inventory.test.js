import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { createUserSession } from '../src/modules/auth/auth.service.js';
import { CatalogProduct } from '../src/models/catalog-product.model.js';
import { InventoryMovement } from '../src/models/inventory-movement.model.js';
import { Order } from '../src/models/order.model.js';
import { User } from '../src/models/user.model.js';

let mongoServer;
let adminToken;
let product;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await Promise.all([
    CatalogProduct.deleteMany({}),
    InventoryMovement.deleteMany({}),
    Order.deleteMany({}),
    User.deleteMany({}),
  ]);
  const admin = await User.create({
    email: 'inventory-admin@example.com',
    name: 'Inventory Admin',
    role: 'admin',
    passwordHash: await bcrypt.hash('AdminPassword123!', 12),
    isVerified: true,
  });
  adminToken = (await createUserSession(admin, true)).accessToken;
  product = await CatalogProduct.create({
    name: 'Inventory Test Saree',
    slug: `inventory-test-${new mongoose.Types.ObjectId()}`,
    sku: `INV-${Date.now()}`,
    category: new mongoose.Types.ObjectId(),
    categorySlug: 'sarees',
    price: 1000,
    stockQuantity: 10,
    reservedQuantity: 2,
    lowStockThreshold: 5,
    reorderQuantity: 20,
  });
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('Admin inventory management', () => {
  it('lists inventory, summarizes stock, and exposes filter metadata', async () => {
    const list = await request(app)
      .get('/api/v1/admin/inventory?status=in_stock&page=1&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);
    const summary = await request(app)
      .get('/api/v1/admin/inventory/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    const filters = await request(app)
      .get('/api/v1/admin/inventory/filters')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({
      productId: product._id.toString(),
      stockQuantity: 10,
      reservedQuantity: 2,
      availableQuantity: 8,
      lowStockThreshold: 5,
      status: 'in_stock',
    });
    expect(summary.body.data).toMatchObject({
      products: 1,
      totalStock: 10,
      totalReserved: 2,
      totalAvailable: 8,
    });
    expect(filters.body.data.movementTypes).toContain('restock');
  });

  it('records restock and blocks damage below active reservations', async () => {
    const restock = await request(app)
      .post(`/api/v1/admin/inventory/${product._id}/restock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        quantity: 5,
        reason: 'Supplier delivery received',
        supplierName: 'TGSCO Supplier',
        supplierInvoiceNumber: 'SUP-1001',
        unitCost: 500,
        receivedAt: '2026-10-28T05:00:00.000Z',
        note: 'Quality checked',
      });
    const damage = await request(app)
      .post(`/api/v1/admin/inventory/${product._id}/damage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 20, reason: 'Damaged stock' });
    const movements = await request(app)
      .get(`/api/v1/admin/inventory/${product._id}/movements?movementType=restock`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(restock.status).toBe(201);
    expect(restock.body.data.inventory.stockQuantity).toBe(15);
    expect(restock.body.data.movement).toMatchObject({
      movementType: 'restock',
      supplierInvoiceNumber: 'SUP-1001',
      quantityDelta: 5,
    });
    expect(damage.status).toBe(409);
    expect(damage.body.error.code).toBe('NEGATIVE_AVAILABLE_STOCK');
    expect(movements.status).toBe(200);
    expect(movements.body.data.items).toHaveLength(1);
  });

  it('reconciles physical stock and lists active reservations', async () => {
    const reconcile = await request(app)
      .post(`/api/v1/admin/inventory/${product._id}/reconcile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ physicalQuantity: 7, reason: 'Monthly physical count' });
    const reservations = await request(app)
      .get('/api/v1/admin/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reconcile.status).toBe(201);
    expect(reconcile.body.data.inventory).toMatchObject({
      stockQuantity: 7,
      reservedQuantity: 2,
      availableQuantity: 5,
      status: 'low_stock',
    });
    expect(reservations.status).toBe(200);
    expect(reservations.body.data).toEqual([]);
  });
});
