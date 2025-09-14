/**
 * Unit Tests for Patient Verification Service
 * HIPAA Compliance: All test data uses synthetic, non-PHI information
 */

import { jest } from '@jest/globals';
import { PatientVerificationService, VerificationConfig } from '../services/patient-verification-service';
import { OpenEMRClient } from '../services/openemr-client';
import { VerificationSessionManager } from '../services/verification-session-manager';

// Mock OpenEMR Client
const mockOpenEMRClient = {
  authenticateWithPassword: jest.fn().mockResolvedValue({ access_token: 'test_token' }),
  verifyPatient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
  logout: jest.fn().mockResolvedValue(undefined)
};

// Mock Session Manager
const mockSessionManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  createSession: jest.fn(),
  getSession: jest.fn(),
  recordAttempt: jest.fn(),
  generateVerificationToken: jest.fn().mockReturnValue('mock_token'),
  verifyToken: jest.fn(),
  getAuditTrail: jest.fn().mockResolvedValue([])
};

jest.mock('../services/openemr-client', () => ({
  OpenEMRClient: jest.fn(() => mockOpenEMRClient)
}));

jest.mock('../services/verification-session-manager', () => ({
  VerificationSessionManager: jest.fn(() => mockSessionManager)
}));

describe('PatientVerificationService', () => {
  let verificationService: PatientVerificationService;
  let config: VerificationConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      openemr: {
        baseUrl: 'http://localhost:8300',
        clientId: 'test_client',
        clientSecret: 'test_secret',
        username: 'test_user',
        password: 'test_pass'
      },
      verification: {
        maxAttempts: 3,
        sessionTimeoutMinutes: 15,
        requirePhone: true
      }
    };

    verificationService = new PatientVerificationService(config);
  });

  afterEach(async () => {
    // Cleanup
    await verificationService.shutdown();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await verificationService.initialize();

      expect(mockSessionManager.connect).toHaveBeenCalled();
      expect(mockOpenEMRClient.authenticateWithPassword).toHaveBeenCalledWith(
        config.openemr.username,
        config.openemr.password
      );
    });

    it('should handle initialization errors', async () => {
      mockSessionManager.connect.mockRejectedValue(new Error('Redis connection failed'));

      await expect(verificationService.initialize()).rejects.toThrow();
    });

    it('should shutdown gracefully', async () => {
      await verificationService.shutdown();

      expect(mockSessionManager.disconnect).toHaveBeenCalled();
      expect(mockOpenEMRClient.logout).toHaveBeenCalled();
    });
  });

  describe('Verification Session Management', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should start new verification session', async () => {
      const mockSession = {
        sessionId: 'test_session_123',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);

      const result = await verificationService.startVerification();

      expect(result.sessionId).toBe('test_session_123');
      expect(result.message).toContain('Verification session started');
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        undefined,
        config.verification.maxAttempts,
        config.verification.sessionTimeoutMinutes
      );
    });

    it('should start verification with custom session ID', async () => {
      const customSessionId = 'custom_session_456';
      const mockSession = {
        sessionId: customSessionId,
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);

      const result = await verificationService.startVerification(customSessionId);

      expect(result.sessionId).toBe(customSessionId);
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        customSessionId,
        config.verification.maxAttempts,
        config.verification.sessionTimeoutMinutes
      );
    });
  });

  describe('Patient Verification', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should successfully verify patient on first attempt', async () => {
      const mockPatient = {
        pid: 'patient_123',
        fname: 'John',
        lname: 'Doe',
        DOB: '1990-01-01',
        phone_home: '1234567890'
      };

      const mockSession = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      const mockUpdatedSession = {
        ...mockSession,
        attempts: 1,
        verified: true,
        patientId: 'patient_123'
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockOpenEMRClient.verifyPatient.mockResolvedValue(mockPatient);
      mockSessionManager.recordAttempt.mockResolvedValue(mockUpdatedSession);

      const request = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        phoneNumber: '1234567890',
        metadata: {
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent'
        }
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(true);
      expect(result.patientId).toBe('patient_123');
      expect(result.verificationToken).toBe('mock_token');
      expect(result.escalationRequired).toBe(false);
      expect(result.message).toContain('Identity verified successfully');
      
      expect(mockOpenEMRClient.verifyPatient).toHaveBeenCalledWith(
        'John', 'Doe', '1990-01-01', '1234567890'
      );
    });

    it('should handle failed verification attempt', async () => {
      const mockSession = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      const mockUpdatedSession = {
        ...mockSession,
        attempts: 1,
        verified: false
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockOpenEMRClient.verifyPatient.mockResolvedValue(null);
      mockSessionManager.recordAttempt.mockResolvedValue(mockUpdatedSession);

      const request = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-05-15',
        phoneNumber: '9876543210'
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(false);
      expect(result.escalationRequired).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.message).toContain('Unable to verify your identity');
      expect(result.message).toContain('2 attempt');
    });

    it('should trigger escalation after max attempts', async () => {
      const mockSession = {
        sessionId: 'test_session',
        attempts: 2,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      const mockUpdatedSession = {
        ...mockSession,
        attempts: 3,
        verified: false,
        escalationTriggered: true
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockOpenEMRClient.verifyPatient.mockResolvedValue(null);
      mockSessionManager.recordAttempt.mockResolvedValue(mockUpdatedSession);

      const request = {
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-05-15',
        phoneNumber: '9876543210'
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.message).toContain('speak with a staff member');
      expect(result.nextSteps).toContain('escalate_to_human');
    });

    it('should return early for already escalated session', async () => {
      const mockSession = {
        sessionId: 'test_session',
        attempts: 3,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: true
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const request = {
        sessionId: 'test_session',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-05-15'
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(false);
      expect(result.escalationRequired).toBe(true);
      expect(result.message).toContain('Maximum verification attempts exceeded');
      
      // Should not attempt verification with OpenEMR
      expect(mockOpenEMRClient.verifyPatient).not.toHaveBeenCalled();
    });

    it('should return early for already verified session', async () => {
      const mockSession = {
        sessionId: 'test_session',
        patientId: 'patient_123',
        attempts: 1,
        maxAttempts: 3,
        verified: true,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const request = {
        sessionId: 'test_session',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01'
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(true);
      expect(result.patientId).toBe('patient_123');
      expect(result.verificationToken).toBe('mock_token');
      expect(result.message).toContain('already verified');

      // Should not attempt verification with OpenEMR
      expect(mockOpenEMRClient.verifyPatient).not.toHaveBeenCalled();
    });

    it('should handle OpenEMR service errors', async () => {
      const mockSession = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      const mockUpdatedSession = {
        ...mockSession,
        attempts: 1,
        verified: false
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockOpenEMRClient.verifyPatient.mockRejectedValue(new Error('OpenEMR connection failed'));
      mockSessionManager.recordAttempt.mockResolvedValue(mockUpdatedSession);

      const request = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        phoneNumber: '1234567890'
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unable to verify your identity');
      
      expect(mockSessionManager.recordAttempt).toHaveBeenCalledWith(
        expect.any(String),
        false,
        expect.any(Object),
        'Unable to verify with patient records system',
        expect.any(Object)
      );
    });

    it('should handle phone number requirements', async () => {
      const mockPatient = {
        pid: 'patient_123',
        fname: 'John',
        lname: 'Doe',
        DOB: '1990-01-01',
        phone_home: '1111111111' // Different from provided phone
      };

      const mockSession = {
        sessionId: 'test_session',
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        escalationTriggered: false
      };

      const mockUpdatedSession = {
        ...mockSession,
        attempts: 1,
        verified: false
      };

      mockSessionManager.createSession.mockResolvedValue(mockSession);
      mockOpenEMRClient.verifyPatient.mockResolvedValue(mockPatient);
      mockSessionManager.recordAttempt.mockResolvedValue(mockUpdatedSession);

      const request = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        phoneNumber: '1234567890' // Different phone number
      };

      const result = await verificationService.verifyPatient(request);

      expect(result.success).toBe(false);
      expect(mockSessionManager.recordAttempt).toHaveBeenCalledWith(
        expect.any(String),
        false,
        expect.any(Object),
        'Phone number does not match records',
        expect.any(Object)
      );
    });
  });

  describe('Verification Status', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should get verification status for existing session', async () => {
      const mockSession = {
        sessionId: 'test_session',
        verified: true,
        attempts: 1,
        maxAttempts: 3,
        escalationTriggered: false,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        createdAt: new Date()
      };

      mockSessionManager.getSession.mockResolvedValue(mockSession);

      const status = await verificationService.getVerificationStatus('test_session');

      expect(status.found).toBe(true);
      expect(status.verified).toBe(true);
      expect(status.attempts).toBe(1);
      expect(status.escalationRequired).toBe(false);
      expect(status.expiresAt).toEqual(mockSession.expiresAt);
    });

    it('should return not found for non-existent session', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);

      const status = await verificationService.getVerificationStatus('non_existent');

      expect(status.found).toBe(false);
      expect(status.verified).toBe(false);
      expect(status.attempts).toBe(0);
      expect(status.escalationRequired).toBe(false);
    });
  });

  describe('Token Validation', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should validate valid token', async () => {
      mockSessionManager.verifyToken.mockReturnValue({
        valid: true,
        payload: {
          sessionId: 'test_session',
          patientId: 'patient_123',
          verified: true
        }
      });

      const result = verificationService.validateVerificationToken('valid_token');

      expect(result.valid).toBe(true);
      expect(result.patientId).toBe('patient_123');
      expect(result.sessionId).toBe('test_session');
    });

    it('should reject invalid token', async () => {
      mockSessionManager.verifyToken.mockReturnValue({
        valid: false,
        error: 'Token expired'
      });

      const result = verificationService.validateVerificationToken('invalid_token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });
  });

  describe('Conversation Flow', () => {
    it('should generate conversation flow for each step', async () => {
      const steps: Array<'start' | 'first_name' | 'last_name' | 'dob' | 'phone'> = [
        'start', 'first_name', 'last_name', 'dob', 'phone'
      ];

      steps.forEach(step => {
        const flow = verificationService.generateConversationFlow(step);
        
        expect(flow.prompt).toBeDefined();
        expect(flow.expectedInfo).toBeDefined();
        expect(flow.nextStep).toBeDefined();
        expect(typeof flow.prompt).toBe('string');
        expect(flow.prompt.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should return healthy status when all services are up', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);
      mockOpenEMRClient.testConnection.mockResolvedValue({ success: true });

      const health = await verificationService.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.checks.redis).toBe(true);
      expect(health.checks.openemr).toBe(true);
    });

    it('should return degraded status when Redis is down', async () => {
      mockSessionManager.getSession.mockRejectedValue(new Error('Redis down'));
      mockOpenEMRClient.testConnection.mockResolvedValue({ success: true });

      const health = await verificationService.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.checks.redis).toBe(false);
      expect(health.checks.openemr).toBe(true);
    });

    it('should return degraded status when OpenEMR is down', async () => {
      mockSessionManager.getSession.mockResolvedValue(null);
      mockOpenEMRClient.testConnection.mockResolvedValue({ success: false });

      const health = await verificationService.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.checks.redis).toBe(true);
      expect(health.checks.openemr).toBe(false);
    });
  });

  describe('Audit Trail', () => {
    beforeEach(async () => {
      await verificationService.initialize();
    });

    it('should retrieve audit trail for session', async () => {
      const mockAuditTrail = [
        {
          sessionId: 'test_session',
          timestamp: new Date(),
          success: false,
          providedData: {},
          failureReason: 'Test failure'
        }
      ];

      mockSessionManager.getAuditTrail.mockResolvedValue(mockAuditTrail);

      const auditTrail = await verificationService.getAuditTrail('test_session');

      expect(auditTrail).toEqual(mockAuditTrail);
      expect(mockSessionManager.getAuditTrail).toHaveBeenCalledWith('test_session');
    });
  });
});