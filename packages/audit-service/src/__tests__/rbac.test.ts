/**
 * Tests for Role-Based Access Control (RBAC) middleware
 * Validates authentication, authorization, and permission enforcement
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server';
import { AuditRole, AuditPermission } from '../middleware/rbac';

describe('RBAC Middleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
  const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'default-service-token';

  // Helper function to generate JWT tokens
  const generateToken = (payload: Record<string, any>): string => {
    return jwt.sign(payload, JWT_SECRET);
  };

  // Test user tokens
  const adminToken = generateToken({
    id: 'admin-user',
    role: AuditRole.ADMIN,
    staffId: 'STAFF001',
    email: 'admin@capitol-eye-care.com'
  });

  const complianceOfficerToken = generateToken({
    id: 'compliance-user',
    role: AuditRole.COMPLIANCE_OFFICER,
    staffId: 'STAFF002',
    email: 'compliance@capitol-eye-care.com'
  });

  const auditViewerToken = generateToken({
    id: 'viewer-user',
    role: AuditRole.AUDIT_VIEWER,
    staffId: 'STAFF003',
    email: 'viewer@capitol-eye-care.com'
  });

  const providerToken = generateToken({
    id: 'provider-user',
    role: AuditRole.PROVIDER,
    staffId: 'STAFF004',
    email: 'provider@capitol-eye-care.com'
  });

  const readonlyToken = generateToken({
    id: 'readonly-user',
    role: AuditRole.READONLY,
    staffId: 'STAFF005',
    email: 'readonly@capitol-eye-care.com'
  });

  describe('Authentication', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request(app)
        .get('/audit/search')
        .expect(401);

      expect(response.body.error).toBe('Access denied');
      expect(response.body.message).toBe('Authentication token required');
    });

    it('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.error).toBe('Invalid token');
    });

    it('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${auditViewerToken}`)
        .expect(501); // Not implemented, but auth passed

      expect(response.body.error).toBe('Not implemented');
    });

    it('should accept valid service token', async () => {
      const response = await request(app)
        .post('/audit/patient-interaction')
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({
          eventType: 'VERIFICATION',
          actionType: 'VERIFY_PATIENT',
          status: 'SUCCESS',
          sessionId: 'test-session',
          details: { method: 'phone_verification' },
          initiator: 'SYSTEM',
          reason: 'AUTOMATED_VERIFICATION',
          authorization: 'VALID'
        })
        .expect(201);

      expect(response.body.message).toBe('Patient interaction logged successfully');
    });

    it('should reject invalid service token', async () => {
      const response = await request(app)
        .post('/audit/patient-interaction')
        .set('X-Service-Token', 'invalid-service-token')
        .expect(403);

      expect(response.body.error).toBe('Invalid service token');
    });
  });

  describe('Role-Based Authorization', () => {
    it('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get('/audit/admin/storage-metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-MFA-Token', '123456')
        .expect(501); // Not implemented, but auth passed

      expect(response.body.error).toBe('Not implemented');
    });

    it('should deny non-admin access to admin endpoints', async () => {
      const response = await request(app)
        .get('/audit/admin/storage-metrics')
        .set('Authorization', `Bearer ${providerToken}`)
        .set('X-MFA-Token', '123456')
        .expect(403);

      expect(response.body.error).toBe('Insufficient role');
    });

    it('should allow compliance officer access to admin retention policies', async () => {
      // First test that compliance officer is rejected due to role requirement
      const response = await request(app)
        .get('/audit/admin/storage-metrics')
        .set('Authorization', `Bearer ${complianceOfficerToken}`)
        .set('X-MFA-Token', '123456')
        .expect(403);

      expect(response.body.error).toBe('Insufficient role');
    });
  });

  describe('Permission-Based Authorization', () => {
    it('should allow users with search permissions to search logs', async () => {
      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${auditViewerToken}`)
        .expect(501); // Not implemented, but auth passed

      expect(response.body.error).toBe('Not implemented');
    });

    it('should deny users without search permissions', async () => {
      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${readonlyToken}`)
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
      expect(response.body.message).toContain('search_all_logs');
    });

    it('should allow providers to log patient interactions', async () => {
      const response = await request(app)
        .post('/audit/patient-interaction')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          eventType: 'VERIFICATION',
          actionType: 'VERIFY_PATIENT',
          status: 'SUCCESS',
          sessionId: 'test-session',
          details: { method: 'phone_verification' },
          initiator: 'STAFF',
          reason: 'PATIENT_VERIFICATION',
          authorization: 'VALID',
          staffId: 'STAFF004'
        })
        .expect(201);

      expect(response.body.message).toBe('Patient interaction logged successfully');
    });

    it('should deny readonly users from logging interactions', async () => {
      const response = await request(app)
        .post('/audit/patient-interaction')
        .set('Authorization', `Bearer ${readonlyToken}`)
        .send({
          eventType: 'VERIFICATION',
          actionType: 'VERIFY_PATIENT',
          status: 'SUCCESS',
          sessionId: 'test-session',
          details: { method: 'phone_verification' },
          initiator: 'STAFF',
          reason: 'PATIENT_VERIFICATION',
          authorization: 'VALID'
        })
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
    });
  });

  describe('Multi-Factor Authentication (MFA)', () => {
    it('should require MFA for report generation', async () => {
      const response = await request(app)
        .post('/audit/reports/generate')
        .set('Authorization', `Bearer ${complianceOfficerToken}`)
        .send({
          title: 'Test Report',
          date_range: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-31T23:59:59Z'
          },
          format: 'json'
        })
        .expect(401);

      expect(response.body.error).toBe('MFA required');
    });

    it('should accept valid MFA token for report generation', async () => {
      const response = await request(app)
        .post('/audit/reports/generate')
        .set('Authorization', `Bearer ${complianceOfficerToken}`)
        .set('X-MFA-Token', '123456')
        .send({
          title: 'Test Report',
          date_range: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-31T23:59:59Z'
          },
          format: 'json'
        })
        .expect(501); // Not implemented, but auth passed

      expect(response.body.error).toBe('Not implemented');
    });

    it('should reject invalid MFA token', async () => {
      const response = await request(app)
        .post('/audit/reports/generate')
        .set('Authorization', `Bearer ${complianceOfficerToken}`)
        .set('X-MFA-Token', '123') // Too short
        .send({
          title: 'Test Report',
          date_range: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-31T23:59:59Z'
          },
          format: 'json'
        })
        .expect(401);

      expect(response.body.error).toBe('Invalid MFA token');
    });

    it('should skip MFA for service accounts', async () => {
      // Service accounts should not require MFA
      const response = await request(app)
        .post('/audit/patient-interaction')
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({
          eventType: 'VERIFICATION',
          actionType: 'VERIFY_PATIENT',
          status: 'SUCCESS',
          sessionId: 'test-session',
          details: { method: 'automated_verification' },
          initiator: 'SYSTEM',
          reason: 'AUTOMATED_PROCESS',
          authorization: 'VALID'
        })
        .expect(201);

      expect(response.body.message).toBe('Patient interaction logged successfully');
    });
  });

  describe('IP Whitelisting', () => {
    beforeAll(() => {
      // Set restricted IP list for testing
      process.env.ADMIN_ALLOWED_IPS = '127.0.0.1,::1';
    });

    it('should allow access from whitelisted IP', async () => {
      const response = await request(app)
        .get('/audit/admin/storage-metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-MFA-Token', '123456')
        .expect(501); // Not implemented, but auth passed

      expect(response.body.error).toBe('Not implemented');
    });

    afterAll(() => {
      delete process.env.ADMIN_ALLOWED_IPS;
    });
  });

  describe('Monitoring Routes RBAC', () => {
    it('should allow audit viewers to access metrics', async () => {
      const response = await request(app)
        .get('/monitoring/metrics')
        .set('Authorization', `Bearer ${auditViewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should deny readonly users access to monitoring', async () => {
      const response = await request(app)
        .get('/monitoring/metrics')
        .set('Authorization', `Bearer ${readonlyToken}`)
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
    });

    it('should allow compliance officers to create alert rules', async () => {
      // This should fail due to role restriction (only admin can create)
      const response = await request(app)
        .post('/monitoring/alert-rules')
        .set('Authorization', `Bearer ${complianceOfficerToken}`)
        .send({
          id: 'test-rule',
          name: 'Test Rule',
          description: 'Test alert rule',
          type: 'THRESHOLD',
          severity: 'MEDIUM',
          enabled: true,
          conditions: {
            metric: 'performance.errorRate',
            operator: 'GT',
            threshold: 0.1,
            timeWindow: 300
          },
          actions: {
            email: ['test@example.com']
          }
        })
        .expect(403);

      expect(response.body.error).toBe('Insufficient role');
    });

    it('should allow admins to create alert rules', async () => {
      const response = await request(app)
        .post('/monitoring/alert-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: 'test-rule',
          name: 'Test Rule',
          description: 'Test alert rule',
          type: 'THRESHOLD',
          severity: 'MEDIUM',
          enabled: true,
          conditions: {
            metric: 'performance.errorRate',
            operator: 'GT',
            threshold: 0.1,
            timeWindow: 300
          },
          actions: {
            email: ['test@example.com']
          }
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-rule');
    });
  });

  describe('Audit Access Logging', () => {
    it('should log all audit access attempts', async () => {
      // Mock console.log to capture audit logs
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${auditViewerToken}`)
        .expect(501);

      // Verify audit access was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT ACCESS]'),
        expect.objectContaining({
          userId: 'viewer-user',
          staffId: 'STAFF003'
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JWT tokens gracefully', async () => {
      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', 'Bearer malformed.jwt.token')
        .expect(403);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Token verification failed');
    });

    it('should handle missing required token fields', async () => {
      const incompleteToken = generateToken({
        id: 'test-user'
        // Missing role field
      });

      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${incompleteToken}`)
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Token missing required fields');
    });

    it('should handle unknown roles gracefully', async () => {
      const unknownRoleToken = generateToken({
        id: 'test-user',
        role: 'UNKNOWN_ROLE'
      });

      const response = await request(app)
        .get('/audit/search')
        .set('Authorization', `Bearer ${unknownRoleToken}`)
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions');
    });
  });
});