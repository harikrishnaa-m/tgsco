import request from 'supertest';
import { describe, expect, it } from 'vitest';

import app from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('returns the API health status', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        database: 'disconnected',
      },
    });
  });

  describe('API errors', () => {
    it('returns a consistent human-readable response for unknown routes', async () => {
      const response = await request(app).get('/api/v1/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'The requested route does not exist: GET /api/v1/does-not-exist',
        },
      });
      expect(response.body.requestId).toBeTypeOf('number');
    });

    it('explains malformed JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send('{"invalid":');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: 'The request body contains invalid JSON.',
        },
      });
    });
  });
});
