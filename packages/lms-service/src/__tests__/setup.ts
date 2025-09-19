// Test setup file
import { logger } from '../utils/logger';

// Silence logger during tests
logger.silent = true;

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.LOG_LEVEL = 'error';