// Jest test setup for patient-verification-service
// HIPAA compliance: Ensure no PHI is used in tests

import { jest } from '@jest/globals';

// Dummy test to prevent Jest error about no tests
describe('Setup', () => {
  it('should configure test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});

beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
});

beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});

afterAll(async () => {
  // Cleanup
});