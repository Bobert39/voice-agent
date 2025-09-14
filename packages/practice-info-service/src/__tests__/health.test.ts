import request from 'supertest';
import app from '../server';

describe('Health Endpoint', () => {
  test('GET /health should return healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      service: 'practice-info-service',
      version: expect.any(String),
      timestamp: expect.any(String),
      uptime: expect.any(Number)
    });
  });

  test('health check should include required fields', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('practice-info-service');
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
  });
});