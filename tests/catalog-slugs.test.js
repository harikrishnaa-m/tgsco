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
  mongoServer = await MongoMemoryServer.create({ instance: { launchTimeout: 30000 } });
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
  if (mongoServer) await mongoServer.stop();
});

describe('catalogue slug generation', () => {
  it('generates SKUs for single products and creates linked size products in bulk', async () => {
    const categoryResponse = await request(app)
      .post('/api/v1/catalog/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Handloom Shirts', type: 'apparel' });
    const singleProductResponse = await request(app)
      .post('/api/v1/catalog/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Single Size Shirt',
        categoryIds: [categoryResponse.body.data._id],
        color: 'Navy Blue',
        price: 1200,
        stockQuantity: 2,
      });
    const customSkuResponse = await request(app)
      .post('/api/v1/catalog/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Custom SKU Shirt',
        sku: 'Custom SKU / Shirt',
        categoryIds: [categoryResponse.body.data._id],
        price: 1200,
        stockQuantity: 2,
      });

    expect(categoryResponse.status).toBe(201);
    expect(singleProductResponse.status).toBe(201);
    expect(singleProductResponse.body.data.sku).toMatch(/^SINGLE-SIZE-SHIRT(?:-\d+)?$/);
    expect(customSkuResponse.status).toBe(201);
    expect(customSkuResponse.body.data.sku).toBe('CUSTOM-SKU-SHIRT');

    const bulkResponse = await request(app)
      .post('/api/v1/catalog/admin/products/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Pochampally Shirt',
        categoryIds: [categoryResponse.body.data._id],
        color: 'Emerald Green',
        shortDescription: 'Classic tailored fit.',
        price: 1475,
        stockQuantity: 3,
        attributes: { fabric: 'Cotton' },
        mainImage: { url: 'https://cdn.example.com/pochampally-shirt.jpg' },
        galleryImages: [{ url: 'https://cdn.example.com/shirt-detail.jpg' }],
        sizes: [
          { size: 'M', sku: 'Custom Pochampally M', stockQuantity: 4 },
          {
            size: 'L',
            price: 1575,
            stockQuantity: 2,
            shortDescription: 'Large tailored fit.',
            currency: 'USD',
            color: 'Blue',
            attributes: { weave: 'Pochampally Ikat' },
            mainImage: { url: 'https://cdn.example.com/pochampally-shirt-large.jpg' },
            galleryImages: [{ url: 'https://cdn.example.com/shirt-large-detail.jpg' }],
          },
        ],
      });

    expect(bulkResponse.status).toBe(201);
    expect(bulkResponse.body.data.items).toHaveLength(2);
    const [medium, large] = bulkResponse.body.data.items;
    expect(bulkResponse.body.data.productGroup).toBeTruthy();
    expect(medium.productGroup).toBe(bulkResponse.body.data.productGroup);
    expect(large.productGroup).toBe(bulkResponse.body.data.productGroup);
    expect(medium.color).toBe('Emerald Green');
    expect(large.color).toBe('Emerald Green');
    expect(medium.attributes).toMatchObject({ fabric: 'Cotton', size: 'M' });
    expect(large.attributes).toMatchObject({
      fabric: 'Cotton',
      weave: 'Pochampally Ikat',
      size: 'L',
    });
    expect(medium.shortDescription).toBe('Classic tailored fit.');
    expect(large.shortDescription).toBe('Large tailored fit.');
    expect(large.currency).toBe('USD');
    expect(medium.mainImage.url).toBe('https://cdn.example.com/pochampally-shirt.jpg');
    expect(large.mainImage.url).toBe('https://cdn.example.com/pochampally-shirt-large.jpg');
    expect(medium.galleryImages[0].url).toBe('https://cdn.example.com/shirt-detail.jpg');
    expect(large.galleryImages[0].url).toBe('https://cdn.example.com/shirt-large-detail.jpg');
    expect(medium.price).toBe(1475);
    expect(large.price).toBe(1575);
    expect(medium.sku).toBe('CUSTOM-POCHAMPALLY-M');
    expect(large.sku).toMatch(/^POCHAMPALLY-SHIRT-L(?:-\d+)?$/);
    expect(medium.sku).not.toBe(large.sku);
    expect(medium.slug).not.toBe(large.slug);

    const colorFilterResponse = await request(app)
      .get('/api/v1/catalog/products')
      .query({ color: 'Emerald Green' });
    expect(colorFilterResponse.status).toBe(200);
    expect(colorFilterResponse.body.data.items.map((item) => item.color)).toEqual([
      'Emerald Green',
      'Emerald Green',
    ]);

    const colorOptionsResponse = await request(app).get('/api/v1/catalog/products/filters');
    expect(colorOptionsResponse.status).toBe(200);
    expect(colorOptionsResponse.body.data.color).toContain('Emerald Green');

    const duplicateSkuResponse = await request(app)
      .post('/api/v1/catalog/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate SKU Shirt',
        sku: 'pochampally-shirt-l',
        categoryIds: [categoryResponse.body.data._id],
        price: 100,
        stockQuantity: 1,
      });
    expect(duplicateSkuResponse.status).toBe(409);
    expect(duplicateSkuResponse.body.error.code).toBe('DUPLICATE_SKU');

    const detailResponse = await request(app).get(`/api/v1/catalog/products/${medium._id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.associatedProducts).toEqual([{ id: large._id, size: 'L' }]);

    const adminDetailResponse = await request(app)
      .get(`/api/v1/catalog/admin/products/${large._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDetailResponse.status).toBe(200);
    expect(adminDetailResponse.body.data.associatedProducts).toEqual([
      { id: medium._id, size: 'M' },
    ]);
  });

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
