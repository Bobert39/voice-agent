import request from 'supertest';
import app from '../server';

describe('Scheduling Service - Health Endpoint', () => {
  afterAll(async () => {
    // Close server connections
    await new Promise<void>((resolve) => {
      const server = app.listen();
      server.close(() => resolve());
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'scheduling-service',
        version: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should return non-negative uptime', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});