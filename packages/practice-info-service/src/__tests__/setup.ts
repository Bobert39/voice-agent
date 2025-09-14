// Test setup for practice-info-service
// This file runs before each test file is executed

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PORT = '0'; // Use random available port for tests

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock Redis and PostgreSQL connections during tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  })),
}));

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  })),
}));

// Basic test to ensure setup is working
describe('Test Environment Setup', () => {
  test('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});