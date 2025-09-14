import { createLogger } from '../logger';

describe('Logger', () => {
  it('should create a logger with service name', () => {
    const logger = createLogger('test-service');
    expect(logger).toBeDefined();
    // In test environment, LOG_LEVEL is set to 'silent' in setup.ts
    expect(['info', 'silent']).toContain(logger.level);
  });

  it('should respect LOG_LEVEL environment variable', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = createLogger('test-service');
    expect(logger.level).toBe('debug');
    delete process.env.LOG_LEVEL;
  });

  it('should have required transports configured', () => {
    const logger = createLogger('test-service');
    expect(logger.transports.length).toBeGreaterThan(0);
  });

  it('should include service name in default metadata', () => {
    const logger = createLogger('test-service');
    expect(logger.defaultMeta).toEqual({ service: 'test-service' });
  });
});