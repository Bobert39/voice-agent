/**
 * Tests for AuditLogger service
 * Validates HIPAA-compliant logging functionality
 */

import { AuditLogger, AuditLoggerConfig } from '../services/audit-logger';
import {
  LogLevel,
  LogCategory,
  EventType,
  ActionType,
  ActionStatus,
  InitiatorType,
  AuthorizationStatus
} from '../types/audit-log';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let config: AuditLoggerConfig;

  beforeEach(() => {
    config = {
      serviceName: 'test-service',
      enableEncryption: false,
      enableIntegrityCheck: true,
      enablePHIMasking: true
    };
    auditLogger = new AuditLogger(config);
  });

  describe('logPatientInteraction', () => {
    it('should log patient verification successfully', async () => {
      const logData = {
        eventType: EventType.VERIFICATION,
        actionType: ActionType.VERIFY_PATIENT,
        status: ActionStatus.SUCCESS,
        patientId: 'MRN123456',
        sessionId: 'session-123',
        details: {
          verification_method: 'DOB_NAME' as any,
          appointment_type: 'routine_exam'
        },
        initiator: InitiatorType.PATIENT,
        reason: 'PATIENT_REQUEST',
        authorization: AuthorizationStatus.VALID
      };

      await expect(auditLogger.logPatientInteraction(logData)).resolves.not.toThrow();
    });

    it('should log appointment scheduling', async () => {
      const logData = {
        eventType: EventType.APPOINTMENT,
        actionType: ActionType.SCHEDULE_APPOINTMENT,
        status: ActionStatus.SUCCESS,
        patientId: 'MRN789012',
        sessionId: 'session-456',
        details: {
          appointment_type: 'follow_up',
          appointment_id: 'appt-789',
          provider_id: 'dr-smith'
        },
        metadata: {
          duration_ms: 2500,
          ip_address: '192.168.1.100'
        },
        initiator: InitiatorType.PATIENT,
        reason: 'PATIENT_REQUEST',
        authorization: AuthorizationStatus.VALID
      };

      await expect(auditLogger.logPatientInteraction(logData)).resolves.not.toThrow();
    });

    it('should handle patient verification failure', async () => {
      const logData = {
        eventType: EventType.VERIFICATION,
        actionType: ActionType.VERIFY_PATIENT,
        status: ActionStatus.FAILURE,
        patientId: 'MRN345678',
        sessionId: 'session-789',
        details: {
          verification_method: 'DOB_NAME' as any,
          error_code: 'VERIFICATION_FAILED',
          error_message: 'Date of birth does not match'
        },
        initiator: InitiatorType.PATIENT,
        reason: 'PATIENT_REQUEST',
        authorization: AuthorizationStatus.INVALID
      };

      await expect(auditLogger.logPatientInteraction(logData)).resolves.not.toThrow();
    });
  });

  describe('logSystemActivity', () => {
    it('should log health check activity', async () => {
      const logData = {
        eventType: EventType.HEALTH_CHECK,
        actionType: ActionType.RETRIEVE_INFO,
        status: ActionStatus.SUCCESS,
        details: {
          error_code: undefined
        },
        metadata: {
          duration_ms: 150,
          response_code: 200
        },
        sessionId: 'health-check-001'
      };

      await expect(auditLogger.logSystemActivity(logData)).resolves.not.toThrow();
    });

    it('should log system error', async () => {
      const logData = {
        eventType: EventType.ERROR,
        actionType: ActionType.RETRIEVE_INFO,
        status: ActionStatus.FAILURE,
        details: {
          error_code: 'DATABASE_CONNECTION_FAILED',
          error_message: 'Unable to connect to PostgreSQL'
        },
        metadata: {
          duration_ms: 5000,
          response_code: 500
        }
      };

      await expect(auditLogger.logSystemActivity(logData)).resolves.not.toThrow();
    });
  });

  describe('logSecurityEvent', () => {
    it('should log authentication failure', async () => {
      const logData = {
        eventType: EventType.ACCESS,
        actionType: ActionType.LOGIN,
        status: ActionStatus.FAILURE,
        details: {
          error_code: 'INVALID_CREDENTIALS'
        },
        metadata: {
          ip_address: '192.168.1.200',
          user_agent: 'Mozilla/5.0'
        },
        severity: 'HIGH' as any
      };

      await expect(auditLogger.logSecurityEvent(logData)).resolves.not.toThrow();
    });

    it('should log unauthorized PHI access attempt', async () => {
      const logData = {
        eventType: EventType.ACCESS,
        actionType: ActionType.ACCESS_PHI,
        status: ActionStatus.FAILURE,
        details: {
          error_code: 'UNAUTHORIZED_ACCESS',
          phi_types_accessed: ['medical_records']
        },
        metadata: {
          ip_address: '10.0.0.50'
        },
        staffId: 'staff-123',
        severity: 'CRITICAL' as any
      };

      await expect(auditLogger.logSecurityEvent(logData)).resolves.not.toThrow();
    });
  });

  describe('logComplianceEvent', () => {
    it('should log consent verification', async () => {
      const logData = {
        eventType: EventType.VERIFICATION,
        actionType: ActionType.VERIFY_PATIENT,
        status: ActionStatus.SUCCESS,
        details: {
          verification_method: 'PHONE_VERIFICATION' as any
        },
        sessionId: 'consent-session-001',
        staffId: 'compliance-officer-001'
      };

      await expect(auditLogger.logComplianceEvent(logData)).resolves.not.toThrow();
    });
  });

  describe('PHI Protection', () => {
    it('should hash patient IDs', async () => {
      const originalPatientId = 'MRN123456';

      const logData = {
        eventType: EventType.VERIFICATION,
        actionType: ActionType.VERIFY_PATIENT,
        status: ActionStatus.SUCCESS,
        patientId: originalPatientId,
        sessionId: 'test-session',
        details: {},
        initiator: InitiatorType.PATIENT,
        reason: 'PATIENT_REQUEST',
        authorization: AuthorizationStatus.VALID
      };

      // Mock the winston logger to capture the log entry
      const mockLog = jest.fn();
      (auditLogger as any).winston.log = mockLog;

      await auditLogger.logPatientInteraction(logData);

      expect(mockLog).toHaveBeenCalled();
      const loggedEntry = mockLog.mock.calls[0][2];

      // Patient ID should be hashed, not the original value
      expect(loggedEntry.patient_id).toBeDefined();
      expect(loggedEntry.patient_id).not.toBe(originalPatientId);
      expect(loggedEntry.patient_id).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should detect PHI access correctly', async () => {
      const logData = {
        eventType: EventType.CONVERSATION,
        actionType: ActionType.ACCESS_PHI,
        status: ActionStatus.SUCCESS,
        details: {
          phi_types_accessed: ['medical_records', 'appointment_history']
        },
        sessionId: 'phi-test-session',
        initiator: InitiatorType.STAFF,
        reason: 'MEDICAL_CONSULTATION',
        authorization: AuthorizationStatus.VALID,
        staffId: 'doctor-001'
      };

      const mockLog = jest.fn();
      (auditLogger as any).winston.log = mockLog;

      await auditLogger.logPatientInteraction(logData);

      expect(mockLog).toHaveBeenCalled();
      const loggedEntry = mockLog.mock.calls[0][2];

      expect(loggedEntry.phi_accessed).toBe(true);
    });
  });

  describe('Integrity Protection', () => {
    it('should add integrity data when enabled', async () => {
      const logData = {
        eventType: EventType.VERIFICATION,
        actionType: ActionType.VERIFY_PATIENT,
        status: ActionStatus.SUCCESS,
        sessionId: 'integrity-test',
        details: {},
        initiator: InitiatorType.PATIENT,
        reason: 'PATIENT_REQUEST',
        authorization: AuthorizationStatus.VALID
      };

      const mockLog = jest.fn();
      (auditLogger as any).winston.log = mockLog;

      await auditLogger.logSystemActivity(logData);

      expect(mockLog).toHaveBeenCalled();
      const loggedEntry = mockLog.mock.calls[0][2];

      expect(loggedEntry.integrity).toBeDefined();
      expect(loggedEntry.integrity.hash).toBeDefined();
      expect(loggedEntry.integrity.salt).toBeDefined();
      expect(loggedEntry.integrity.algorithm).toBe('sha256');
    });
  });

  describe('Error Handling', () => {
    it('should handle logging errors gracefully', async () => {
      // Mock winston to throw error
      const mockLog = jest.fn().mockImplementation(() => {
        throw new Error('Logging failed');
      });
      (auditLogger as any).winston.log = mockLog;

      const logData = {
        eventType: EventType.ERROR,
        actionType: ActionType.RETRIEVE_INFO,
        status: ActionStatus.FAILURE,
        details: {},
        sessionId: 'error-test'
      };

      // Should not throw error even if logging fails
      await expect(auditLogger.logSystemActivity(logData)).resolves.not.toThrow();
    });
  });
});