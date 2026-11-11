import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../src/app.js';
import { disconnectDatabase } from '../src/database/connect.js';
import { ensureDefaultAdmin } from '../src/database/seed-admin.js';
import { AboutSection } from '../src/models/about-section.model.js';
import { ContactSection } from '../src/models/contact-section.model.js';
import { HeritageSection } from '../src/models/heritage-section.model.js';
import { HomeSection } from '../src/models/home-section.model.js';
import { NewsSection } from '../src/models/news-section.model.js';
import { SchemeSection } from '../src/models/scheme-section.model.js';

let mongoServer;
let adminToken;

const sectionRoutes = [
  { path: '/api/v1/home-content/hero', section: 'hero', Model: HomeSection },
  { path: '/api/v1/about-content/about-hero', section: 'about-hero', Model: AboutSection },
  {
    path: '/api/v1/heritage-content/heritage-hero',
    section: 'heritage-hero',
    Model: HeritageSection,
  },
  { path: '/api/v1/news-content/news-hero', section: 'news-hero', Model: NewsSection },
  { path: '/api/v1/scheme-content/schemes-hero', section: 'schemes-hero', Model: SchemeSection },
  { path: '/api/v1/contact-content/contact-hero', section: 'contact-hero', Model: ContactSection },
];

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
  await Promise.all(sectionRoutes.map(({ Model }) => Model.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
  await mongoServer.stop();
});

describe('portfolio section partial updates', () => {
  it.each(sectionRoutes)(
    'accepts a raw JSON patch and preserves omitted fields for $section',
    async ({ path, section, Model }) => {
      const originalContent = {
        title: 'Original title',
        subtitle: 'Keep this subtitle',
        nested: { retained: 'keep', changed: 'old' },
        items: ['keep this array'],
      };
      const originalImages = [
        {
          field: 'heroImage',
          url: 'https://cdn.example.com/original.jpg',
          key: 'original.jpg',
        },
      ];
      await Model.create({ section, content: originalContent, images: originalImages });

      const response = await request(app)
        .patch(path)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated title', nested: { changed: 'new' } });

      expect(response.status).toBe(200);
      expect(response.body.data.content).toEqual({
        title: 'Updated title',
        subtitle: 'Keep this subtitle',
        nested: { retained: 'keep', changed: 'new' },
        items: ['keep this array'],
      });
      expect(response.body.data.images).toMatchObject(originalImages);
    },
  );

  it('merges partial Chronicles nested objects', async () => {
    const originalContent = {
      eyebrow: 'Chronicles',
      title: 'Original title',
      paragraphs: ['First paragraph', 'Second paragraph'],
      statistic: { value: '56+', label: 'Years' },
      cta: { label: 'Explore', url: '/collections' },
      closingQuote: 'Original quote',
      leftImageAlt: 'Left image',
      rightImageAlt: 'Right image',
    };
    await HomeSection.create({
      section: 'chronicles-of-thread',
      content: originalContent,
      images: [],
    });

    const response = await request(app)
      .patch('/api/v1/home-content/chronicles-of-thread')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cta: { label: 'Browse' } });

    expect(response.status).toBe(200);
    expect(response.body.data.content.cta).toEqual({
      label: 'Browse',
      url: '/collections',
    });
    expect(response.body.data.content.title).toBe('Original title');
  });

  it('preserves regional map data when only the eyebrow is patched', async () => {
    const content = {
      eyebrow: 'Old regional map',
      regions: [
        {
          regionId: 'hyderabad',
          regionName: 'Hyderabad',
          locations: [
            {
              id: 'loc-hyderabad-01',
              title: 'Sample office',
              lat: 17.385,
              lng: 78.4867,
              image: 'https://cdn.example.com/map.jpg',
              address: 'Sample address',
              phone: '+91 90000 10001',
              email: 'sample@example.com',
              timing: 'Weekdays',
              directionUrl: 'https://maps.google.com/?q=17.385,78.4867',
            },
          ],
        },
      ],
    };
    await ContactSection.create({ section: 'regional-map', content, images: [] });

    const response = await request(app)
      .patch('/api/v1/contact-content/regional-map')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eyebrow: 'Updated regional map' });

    expect(response.status).toBe(200);
    expect(response.body.data.content.eyebrow).toBe('Updated regional map');
    expect(response.body.data.content.regions).toEqual(content.regions);
  });
});
