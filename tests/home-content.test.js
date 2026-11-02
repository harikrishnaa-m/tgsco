import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { HomeSection } from '../src/models/home-section.model.js';

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
  await HomeSection.deleteMany({});
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('Homepage section content', () => {
  it('reads each section publicly and protects section writes', async () => {
    const unauthorizedResponse = await request(app)
      .post('/api/v1/home-content/hero')
      .field('content', JSON.stringify({ title: 'Preserving Heritage' }));

    expect(unauthorizedResponse.status).toBe(401);

    const createResponse = await request(app)
      .post('/api/v1/home-content/hero')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('content', JSON.stringify({ title: 'Preserving Heritage' }));

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      section: 'hero',
      content: { title: 'Preserving Heritage' },
      images: [],
    });

    const publicResponse = await request(app).get('/api/v1/home-content/hero');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.data.section).toBe('hero');
  });

  it('updates and deletes a section through its own endpoint', async () => {
    await request(app)
      .post('/api/v1/home-content/makers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: { name: 'Naveen' } });

    const updateResponse = await request(app)
      .patch('/api/v1/home-content/makers')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('content', JSON.stringify({ name: 'Naveen G' }));

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.content).toEqual({ name: 'Naveen G' });

    const deleteResponse = await request(app)
      .delete('/api/v1/home-content/makers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.status).toBe(200);
    expect((await request(app).get('/api/v1/home-content/makers')).status).toBe(404);
  });

  it('requires a main and border image for every techniques item', async () => {
    const response = await request(app)
      .post('/api/v1/home-content/techniques')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('content', JSON.stringify({ items: [{ name: 'Pochampally Ikat' }] }))
      .attach('items[0].mainImage', Buffer.from('main'), 'main.jpg');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PAIRED_IMAGES_REQUIRED');
    expect(response.body.error.details.missingFields).toContain('items[0].borderImage');
  });

  it('serves the Chronicles of Thread content and its image URLs publicly', async () => {
    const content = {
      eyebrow: 'THE CHRONICLES OF THREAD',
      title: 'A Legacy Woven Through Centuries',
      paragraphs: ['First history paragraph.', 'Second history paragraph.'],
      statistic: { value: '56+', label: 'Years of Weaving Legacy' },
      cta: { label: 'EXPLORE THE COLLECTION', url: '/collections' },
      closingQuote:
        "This is not TGSCO's story alone, it is Telangana's story, told one thread at a time.",
      leftImageAlt: 'Telangana artisan weaving on a traditional handloom',
      rightImageAlt: 'Colorful handwoven Telangana fabric with a zari border',
    };

    await HomeSection.create({
      section: 'chronicles-of-thread',
      content,
      images: [
        { field: 'leftImage', url: 'https://cdn.example.com/left.jpg', key: 'left.jpg' },
        { field: 'rightImage', url: 'https://cdn.example.com/right.jpg', key: 'right.jpg' },
      ],
    });

    const response = await request(app).get('/api/v1/home-content/chronicles-of-thread');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      section: 'chronicles-of-thread',
      content,
      images: [
        { field: 'leftImage', url: 'https://cdn.example.com/left.jpg' },
        { field: 'rightImage', url: 'https://cdn.example.com/right.jpg' },
      ],
    });

    const updateResponse = await request(app)
      .patch('/api/v1/home-content/chronicles-of-thread')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.images).toEqual(response.body.data.images);

    const deleteResponse = await request(app)
      .delete('/api/v1/home-content/chronicles-of-thread')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteResponse.status).toBe(200);
    expect((await request(app).get('/api/v1/home-content/chronicles-of-thread')).status).toBe(404);
  });

  it('requires both Chronicles of Thread images when creating the section', async () => {
    const response = await request(app)
      .post('/api/v1/home-content/chronicles-of-thread')
      .set('Authorization', `Bearer ${adminToken}`)
      .field(
        'content',
        JSON.stringify({
          eyebrow: 'THE CHRONICLES OF THREAD',
          title: 'A Legacy Woven Through Centuries',
          paragraphs: ['First paragraph.', 'Second paragraph.'],
          statistic: { value: '56+', label: 'Years of Weaving Legacy' },
          cta: { label: 'EXPLORE THE COLLECTION', url: '/collections' },
          closingQuote: 'A story told one thread at a time.',
          leftImageAlt: 'Artisan weaving on a traditional handloom',
          rightImageAlt: 'Colorful Telangana handwoven textile',
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SECTION_IMAGES_REQUIRED');
    expect(response.body.error.details.missingFields).toEqual(['leftImage', 'rightImage']);
  });
});
