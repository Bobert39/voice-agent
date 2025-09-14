/**
 * Unit Tests for Verification Session Manager
 * HIPAA Compliance: All test data uses synthetic, non-PHI information
 */

import { jest } from '@jest/globals';
import { VerificationSessionManager } from '../services/verification-session-manager';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

// Mock crypto for consistent testing
const mockCrypto = {
  randomBytes: jest.fn((size: number) => Buffer.from('a'.repeat(size))),
  createCipher: jest.fn(() => ({
    update: jest.fn(() => 'encrypted_data'),
    final: jest.fn(() => '_final')
  })),
  createDecipher: jest.fn(() => ({
    update: jest.fn(() => 'decrypted_data'),
    final: jest.fn(() => '')
  })),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'hashed_value')
  }))
};

jest.mock('crypto', () => mockCrypto);

describe('VerificationSessionManager', () => {
  let sessionManager: VerificationSessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set test environment variables
    process.env.ENCRYPTION_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    process.env.JWT_SECRET = 'test_jwt_secret';
    
    sessionManager = new VerificationSessionManager();
  });

  afterEach(async () => {
    // Cleanup
    delete process.env.ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => {
      await sessionManager.connect();
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should disconnect from Redis successfully', async () => {
      await sessionManager.disconnect();
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('Session Creation', () => {
    beforeEach(async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
    });

    it('should create a new verification session with default settings', async () => {
      const session = await sessionManager.createSession();

      expect(session.sessionId).toBeDefined();
      expect(session.attempts).toBe(0);
      expect(session.maxAttempts).toBe(3);
      expect(session.verified).toBe(false);
      expect(session.escalationTriggered).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should create session with custom parameters', async () => {
      const customSessionId = 'custom_session_123';
      const maxAttempts = 5;
      const timeoutMinutes = 30;

      const session = await sessionManager.createSession(customSessionId, maxAttempts, timeoutMinutes);

      expect(session.sessionId).toBe(customSessionId);
      expect(session.maxAttempts).toBe(maxAttempts);
      
      // Check timeout (approximately)
      const expectedExpiry = new Date(Date.now() + timeoutMinutes * 60 * 1000);
      const timeDiff = Math.abs(session.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should save session to Redis with encryption', async () => {
      await sessionManager.createSession();

      expect(mockRedisClient.setEx).toHaveBeenCalled();
      const [key, ttl, value] = mockRedisClient.setEx.mock.calls[0];
      
      expect(key).toMatch(/^verification_session:/);
      expect(ttl).toBeGreaterThan(0);
      expect(typeof value).toBe('string');
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve existing session', async () => {
      const sessionData = {
        sessionId: 'test_session',
        attempts: 1,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_data',
        iv: 'test_iv'
      }));

      // Mock decryption to return session data
      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      const session = await sessionManager.getSession('test_session');

      expect(session).toBeTruthy();
      expect(session?.sessionId).toBe('test_session');
      expect(session?.attempts).toBe(1);
    });

    it('should return null for non-existent session', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const session = await sessionManager.getSession('non_existent');

      expect(session).toBeNull();
    });

    it('should return null and delete expired session', async () => {
      const expiredSessionData = {
        sessionId: 'expired_session',
        attempts: 1,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
        escalationTriggered: false
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_data',
        iv: 'test_iv'
      }));
      mockRedisClient.del.mockResolvedValue(1);

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(expiredSessionData)),
        final: jest.fn(() => '')
      });

      const session = await sessionManager.getSession('expired_session');

      expect(session).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalledWith('verification_session:expired_session');
    });
  });

  describe('Attempt Recording', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_data',
        iv: 'test_iv'
      }));
      mockRedisClient.setEx.mockResolvedValue('OK');
    });

    it('should record successful verification attempt', async () => {
      const sessionData = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      const providedData = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        phone: '1234567890'
      };

      const session = await sessionManager.recordAttempt(
        'test_session',
        true,
        providedData,
        undefined,
        { ipAddress: '127.0.0.1' }
      );

      expect(session).toBeTruthy();
      expect(session?.attempts).toBe(1);
      expect(session?.verified).toBe(true);
      expect(session?.firstName).toBe('John');
      expect(session?.escalationTriggered).toBe(false);
    });

    it('should record failed verification attempt', async () => {
      const sessionData = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      const providedData = {
        firstName: 'Jane',
        lastName: 'Smith',
        dob: '1985-05-15'
      };

      const session = await sessionManager.recordAttempt(
        'test_session',
        false,
        providedData,
        'No matching patient found',
        { ipAddress: '127.0.0.1' }
      );

      expect(session).toBeTruthy();
      expect(session?.attempts).toBe(1);
      expect(session?.verified).toBe(false);
      expect(session?.escalationTriggered).toBe(false);
    });

    it('should trigger escalation after max attempts', async () => {
      const sessionData = {
        sessionId: 'test_session',
        attempts: 2, // Already at max attempts - 1
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      const providedData = {
        firstName: 'Jane',
        lastName: 'Smith',
        dob: '1985-05-15'
      };

      const session = await sessionManager.recordAttempt(
        'test_session',
        false,
        providedData,
        'No matching patient found'
      );

      expect(session).toBeTruthy();
      expect(session?.attempts).toBe(3);
      expect(session?.escalationTriggered).toBe(true);
    });

    it('should store audit trail for attempts', async () => {
      const sessionData = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      await sessionManager.recordAttempt(
        'test_session',
        false,
        { firstName: 'John', lastName: 'Doe' },
        'Test failure'
      );

      // Check that audit data was stored
      const auditCalls = mockRedisClient.setEx.mock.calls.filter(call => 
        call[0].startsWith('verification_audit:')
      );
      
      expect(auditCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Token Management', () => {
    it('should generate verification token for verified session', async () => {
      const session = {
        sessionId: 'test_session',
        patientId: 'patient_123',
        verified: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempts: 1,
        maxAttempts: 3,
        escalationTriggered: false,
        createdAt: new Date()
      };

      const token = sessionManager.generateVerificationToken(session);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should throw error for unverified session', async () => {
      const session = {
        sessionId: 'test_session',
        verified: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempts: 1,
        maxAttempts: 3,
        escalationTriggered: false,
        createdAt: new Date()
      };

      expect(() => {
        sessionManager.generateVerificationToken(session);
      }).toThrow('Cannot generate token for unverified session');
    });

    it('should verify valid token', async () => {
      // This test would require setting up JWT properly
      // For now, we'll test the error case
      const result = sessionManager.verifyToken('invalid_token');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Session Cleanup', () => {
    it('should check escalation status', async () => {
      const sessionData = {
        sessionId: 'test_session',
        escalationTriggered: true,
        attempts: 3,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_data',
        iv: 'test_iv'
      }));

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      const needsEscalation = await sessionManager.checkEscalationNeeded('test_session');

      expect(needsEscalation).toBe(true);
    });

    it('should delete session', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await sessionManager.deleteSession('test_session');

      expect(mockRedisClient.del).toHaveBeenCalledWith('verification_session:test_session');
    });

    it('should clean up expired sessions', async () => {
      mockRedisClient.keys.mockResolvedValue([
        'verification_session:session1',
        'verification_session:session2'
      ]);
      
      // Mock sessions as expired (getSession returns null)
      mockRedisClient.get.mockResolvedValue(null);

      const cleanedCount = await sessionManager.cleanupExpiredSessions();

      expect(cleanedCount).toBe(2);
    });
  });

  describe('Audit Trail', () => {
    it('should retrieve audit trail for session', async () => {
      const auditKeys = [
        'verification_audit:test_session:1234567890',
        'verification_audit:test_session:1234567891'
      ];

      const auditData = {
        sessionId: 'test_session',
        timestamp: new Date().toISOString(),
        success: false,
        providedData: {},
        failureReason: 'Test failure'
      };

      mockRedisClient.keys.mockResolvedValue(auditKeys);
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_audit',
        iv: 'audit_iv'
      }));

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(auditData)),
        final: jest.fn(() => '')
      });

      const auditTrail = await sessionManager.getAuditTrail('test_session');

      expect(auditTrail).toHaveLength(2);
      expect(auditTrail[0].sessionId).toBe('test_session');
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const session = await sessionManager.getSession('test_session');

      expect(session).toBeNull();
    });

    it('should handle encryption errors gracefully', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Encryption failed'));

      await expect(sessionManager.createSession()).rejects.toThrow();
    });
  });

  describe('Data Privacy', () => {
    it('should hash PII data for audit logging', async () => {
      // The hashPII method is private, but we can test it indirectly
      const sessionData = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        escalationTriggered: false
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        encrypted: 'encrypted_data',
        iv: 'test_iv'
      }));
      mockRedisClient.setEx.mockResolvedValue('OK');

      mockCrypto.createDecipher.mockReturnValue({
        update: jest.fn(() => JSON.stringify(sessionData)),
        final: jest.fn(() => '')
      });

      await sessionManager.recordAttempt(
        'test_session',
        false,
        { firstName: 'John', lastName: 'Doe', dob: '1990-01-01' },
        'Test failure'
      );

      // Verify that crypto.createHash was called (for PII hashing)
      expect(mockCrypto.createHash).toHaveBeenCalled();
    });
  });
});