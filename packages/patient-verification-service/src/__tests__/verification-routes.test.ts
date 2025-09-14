/**
 * Integration Tests for Verification Routes
 * HIPAA Compliance: All test data uses synthetic, non-PHI information
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { verificationRouter, initializeRoutes } from '../routes/verification';

// Mock the PatientVerificationService
const mockVerificationService = {
  startVerification: jest.fn(),
  verifyPatient: jest.fn(),
  getVerificationStatus: jest.fn(),
  validateVerificationToken: jest.fn(),
  generateConversationFlow: jest.fn(),
  getAuditTrail: jest.fn()
};

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/v1/verification', initializeRoutes(mockVerificationService as any));

describe('Verification Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/verification/start', () => {
    it('should start a new verification session', async () => {
      mockVerificationService.startVerification.mockResolvedValue({
        sessionId: 'test_session_123',
        message: 'Verification session started'
      });

      const response = await request(app)
        .post('/api/v1/verification/start')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe('test_session_123');
      expect(mockVerificationService.startVerification).toHaveBeenCalledWith(undefined);
    });

    it('should start session with custom session ID', async () => {
      const customSessionId = 'custom_session_456';
      mockVerificationService.startVerification.mockResolvedValue({
        sessionId: customSessionId,
        message: 'Verification session started'
      });

      const response = await request(app)
        .post('/api/v1/verification/start')
        .send({ sessionId: customSessionId });

      expect(response.status).toBe(200);
      expect(response.body.data.sessionId).toBe(customSessionId);
      expect(mockVerificationService.startVerification).toHaveBeenCalledWith(customSessionId);
    });

    it('should handle service errors', async () => {
      mockVerificationService.startVerification.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/v1/verification/start')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unable to start verification session');
    });
  });

  describe('POST /api/v1/verification/verify', () => {
    const validRequest = {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      phoneNumber: '1234567890',
      sessionId: 'test_session'
    };

    it('should verify patient successfully', async () => {
      const mockResult = {
        success: true,
        sessionId: 'test_session',
        patientId: 'patient_123',
        attempts: 1,
        maxAttempts: 3,
        escalationRequired: false,
        verificationToken: 'mock_token',
        message: 'Identity verified successfully'
      };

      mockVerificationService.verifyPatient.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/verification/verify')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.patientId).toBe('patient_123');
      expect(response.body.data.verificationToken).toBe('mock_token');

      expect(mockVerificationService.verifyPatient).toHaveBeenCalledWith({
        sessionId: 'test_session',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        phoneNumber: '1234567890',
        metadata: {
          ipAddress: expect.any(String),
          userAgent: expect.any(String),
          conversationId: undefined
        }
      });
    });

    it('should handle failed verification', async () => {
      const mockResult = {
        success: false,
        sessionId: 'test_session',
        attempts: 1,
        maxAttempts: 3,
        escalationRequired: false,
        message: 'Unable to verify your identity'
      };

      mockVerificationService.verifyPatient.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/verification/verify')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toBe(false);
      expect(response.body.data.attempts).toBe(1);
    });

    describe('Input Validation', () => {
      it('should reject empty firstName', async () => {
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            firstName: ''
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject invalid firstName characters', async () => {
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            firstName: 'John123'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject empty lastName', async () => {
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            lastName: ''
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject invalid date format', async () => {
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            dateOfBirth: '01/01/1990'
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject future birth dates', async () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            dateOfBirth: futureDate.toISOString().split('T')[0]
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should accept valid names with hyphens and apostrophes', async () => {
        mockVerificationService.verifyPatient.mockResolvedValue({
          success: true,
          sessionId: 'test_session',
          attempts: 1,
          maxAttempts: 3,
          escalationRequired: false,
          message: 'Verified'
        });

        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            ...validRequest,
            firstName: "Mary-Jane",
            lastName: "O'Connor-Smith"
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should handle optional phone number', async () => {
        mockVerificationService.verifyPatient.mockResolvedValue({
          success: true,
          sessionId: 'test_session',
          attempts: 1,
          maxAttempts: 3,
          escalationRequired: false,
          message: 'Verified'
        });

        const { phoneNumber, ...requestWithoutPhone } = validRequest;
        
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send(requestWithoutPhone);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should handle service errors', async () => {
      mockVerificationService.verifyPatient.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/v1/verification/verify')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Verification service error');
    });
  });

  describe('GET /api/v1/verification/status/:sessionId', () => {
    it('should get verification status for existing session', async () => {
      const mockStatus = {
        found: true,
        verified: true,
        attempts: 1,
        maxAttempts: 3,
        escalationRequired: false,
        expiresAt: new Date()
      };

      mockVerificationService.getVerificationStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/v1/verification/status/test_session_123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.verified).toBe(true);
      expect(mockVerificationService.getVerificationStatus).toHaveBeenCalledWith('test_session_123');
    });

    it('should handle invalid session ID format', async () => {
      const response = await request(app)
        .get('/api/v1/verification/status/abc');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid session ID format');
    });

    it('should handle service errors', async () => {
      mockVerificationService.getVerificationStatus.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/v1/verification/status/valid_session_123');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/verification/validate-token', () => {
    it('should validate valid token', async () => {
      mockVerificationService.validateVerificationToken.mockReturnValue({
        valid: true,
        patientId: 'patient_123',
        sessionId: 'test_session'
      });

      const response = await request(app)
        .post('/api/v1/verification/validate-token')
        .send({ token: 'valid_token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.patientId).toBe('patient_123');
    });

    it('should reject invalid token', async () => {
      mockVerificationService.validateVerificationToken.mockReturnValue({
        valid: false,
        error: 'Token expired'
      });

      const response = await request(app)
        .post('/api/v1/verification/validate-token')
        .send({ token: 'invalid_token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid verification token');
    });

    it('should reject missing token', async () => {
      const response = await request(app)
        .post('/api/v1/verification/validate-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token is required');
    });
  });

  describe('GET /api/v1/verification/conversation-flow/:step', () => {
    it('should return conversation flow for valid step', async () => {
      const mockFlow = {
        prompt: 'May I have your first name?',
        expectedInfo: 'first_name',
        nextStep: 'first_name'
      };

      mockVerificationService.generateConversationFlow.mockReturnValue(mockFlow);

      const response = await request(app)
        .get('/api/v1/verification/conversation-flow/start');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.prompt).toContain('first name');
      expect(mockVerificationService.generateConversationFlow).toHaveBeenCalledWith('start');
    });

    it('should reject invalid step', async () => {
      const response = await request(app)
        .get('/api/v1/verification/conversation-flow/invalid_step');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid conversation step');
    });

    it('should handle all valid conversation steps', async () => {
      const validSteps = ['start', 'first_name', 'last_name', 'dob', 'phone'];
      
      for (const step of validSteps) {
        mockVerificationService.generateConversationFlow.mockReturnValue({
          prompt: `Prompt for ${step}`,
          expectedInfo: step,
          nextStep: 'next'
        });

        const response = await request(app)
          .get(`/api/v1/verification/conversation-flow/${step}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/v1/verification/audit/:sessionId', () => {
    it('should return audit trail with proper authentication', async () => {
      const mockAuditTrail = [
        {
          sessionId: 'test_session',
          timestamp: new Date(),
          success: false,
          providedData: {},
          failureReason: 'Test failure'
        }
      ];

      mockVerificationService.getAuditTrail.mockResolvedValue(mockAuditTrail);

      const response = await request(app)
        .get('/api/v1/verification/audit/test_session_123')
        .set('Authorization', 'Bearer audit_token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe('test_session_123');
      expect(response.body.data.auditTrail).toEqual(mockAuditTrail);
    });

    it('should reject unauthorized access', async () => {
      const response = await request(app)
        .get('/api/v1/verification/audit/test_session_123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized access to audit trail');
    });

    it('should reject invalid auth token', async () => {
      const response = await request(app)
        .get('/api/v1/verification/audit/test_session_123')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should handle invalid session ID format', async () => {
      const response = await request(app)
        .get('/api/v1/verification/audit/abc')
        .set('Authorization', 'Bearer audit_token');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid session ID format');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow normal request rate', async () => {
      mockVerificationService.verifyPatient.mockResolvedValue({
        success: false,
        sessionId: 'test',
        attempts: 1,
        maxAttempts: 3,
        escalationRequired: false,
        message: 'Failed'
      });

      // Make multiple requests under the limit
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/v1/verification/verify')
          .send({
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01'
          });

        expect(response.status).toBe(200);
      }
    });

    // Note: Rate limiting tests are difficult to test in unit tests
    // as they require time-based behavior. In practice, these would
    // be better tested in integration or E2E tests.
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/verification/verify')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/verification/verify')
        .send({
          firstName: 'John'
          // Missing lastName and dateOfBirth
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should sanitize error messages', async () => {
      mockVerificationService.verifyPatient.mockRejectedValue(
        new Error('Internal database connection details: password=secret123')
      );

      const response = await request(app)
        .post('/api/v1/verification/verify')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Verification service error');
      expect(response.body.message).toBe('Unable to process verification request. Please try again later.');
      
      // Should not expose internal error details
      expect(JSON.stringify(response.body)).not.toContain('password');
      expect(JSON.stringify(response.body)).not.toContain('secret123');
    });
  });
});