// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock Redis for tests
jest.mock('ioredis', () => {
  const Redis = jest.requireActual('ioredis-mock');
  return Redis;
});

// Set test timeout
jest.setTimeout(10000);