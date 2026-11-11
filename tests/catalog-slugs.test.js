import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { CatalogCategory } from '../src/models/catalog-category.model.js';
import { CatalogGroup } from '../src/models/catalog-group.model.js';
import { CatalogProduct } from '../src/models/catalog-product.model.js';

let mongoServer;
let adminToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await ensureDefaultAdmin();

  const loginResponse = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@example.com',
    password: 'password',
  });
  adminToken = loginResponse.body.data.accessToken;
});

beforeEach(async () => {
  await CatalogProduct.deleteMany({});
  await CatalogCategory.deleteMany({});
  await CatalogGroup.deleteMany({});
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('catalogue slug generation', () => {
  it('generates unique slugs for groups, categories, and products', async () => {
    const groupResponse = await request(app)
      .post('/api/v1/catalog/admin/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Handloom Groups' });
    const duplicateGroupResponse = await request(app)
      .post('/api/v1/catalog/admin/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Handloom Groups' });

    expect(groupResponse.status).toBe(201);
    expect(groupResponse.body.data.slug).toBe('handloom-groups');
    expect(duplicateGroupResponse.body.data.slug).toBe('handloom-groups-2');

    const categoryResponse = await request(app)
      .post('/api/v1/catalog/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Silk Sarees', groupId: groupResponse.body.data._id });
    const duplicateCategoryResponse = await request(app)
      .post('/api/v1/catalog/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Silk Sarees', groupId: groupResponse.body.data._id });

    expect(categoryResponse.status).toBe(201);
    expect(categoryResponse.body.data.slug).toBe('silk-sarees');
    expect(duplicateCategoryResponse.body.data.slug).toBe('silk-sarees-2');

    const productPayload = {
      name: 'Cotton Silk Saree',
      sku: 'COTTON-SILK-1',
      categoryIds: [categoryResponse.body.data._id],
      price: 100,
      stockQuantity: 1,
    };
    const productResponse = await request(app)
      .post('/api/v1/catalog/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(productPayload);
    const duplicateProductResponse = await request(app)
      .post('/api/v1/catalog/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...productPayload, sku: 'COTTON-SILK-2' });

    expect(productResponse.status).toBe(201);
    expect(productResponse.body.data.slug).toBe('cotton-silk-saree');
    expect(duplicateProductResponse.body.data.slug).toBe('cotton-silk-saree-2');
  });

  it('regenerates a slug after a name change and preserves supplied slugs', async () => {
    const createResponse = await request(app)
      .post('/api/v1/catalog/admin/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Old Name' });

    const updateResponse = await request(app)
      .patch(`/api/v1/catalog/admin/groups/${createResponse.body.data._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name' });

    const suppliedSlugResponse = await request(app)
      .post('/api/v1/catalog/admin/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Another Name', slug: 'chosen-group' });

    expect(createResponse.body.data.slug).toBe('old-name');
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.slug).toBe('new-name');
    expect(suppliedSlugResponse.status).toBe(201);
    expect(suppliedSlugResponse.body.data.slug).toBe('chosen-group');
  });
});
