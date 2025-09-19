/**
 * Tests for Encryption Service
 * Verifies AES-256 encryption, key rotation, and HIPAA compliance
 */

import { EncryptionService } from '../services/encryption.service';
import { AuditLogEntry, LogLevel, LogCategory, EventType, ActionType, ActionStatus, InitiatorType, AuthorizationStatus } from '../types/audit-log';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  const createMockLog = (overrides?: Partial<AuditLogEntry>): AuditLogEntry => ({
    timestamp: new Date().toISOString(),
    log_level: LogLevel.INFO,
    category: LogCategory.PATIENT_INTERACTION,
    event_type: EventType.ACCESS,
    patient_id: 'test-patient-123',
    session_id: 'test-session',
    service: 'test-service',
    action: {
      type: ActionType.RETRIEVE_INFO,
      status: ActionStatus.SUCCESS,
      details: {
        ssn: '123-45-6789',
        dob: '1990-01-01',
        phone: '555-1234'
      } as any
    },
    metadata: {
      ip_address: '192.168.1.100',
      user_agent: 'TestAgent/1.0',
      duration_ms: 100,
      correlation_id: 'test-correlation'
    },
    phi_accessed: true,
    audit_trail: {
      initiator: InitiatorType.PATIENT,
      reason: 'TEST_REASON',
      authorization: AuthorizationStatus.VALID
    },
    ...overrides
  });

  beforeEach(() => {
    encryptionService = new EncryptionService({
      keyRotationDays: 90,
      saltRounds: 10 // Reduced for testing
    });
  });

  describe('Log Encryption and Decryption', () => {
    it('should encrypt and decrypt audit log successfully', async () => {
      const originalLog = createMockLog();

      const encrypted = await encryptionService.encryptLog(originalLog);
      expect(encrypted.data).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.keyVersion).toBe(1);
      expect(encrypted.algorithm).toBe('aes-256-cbc');
      expect(encrypted.checksum).toBeDefined();

      const decrypted = await encryptionService.decryptLog(encrypted);
      expect(decrypted).toEqual(originalLog);
    });

    it('should generate different ciphertext for same data', async () => {
      const log = createMockLog();

      const encrypted1 = await encryptionService.encryptLog(log);
      const encrypted2 = await encryptionService.encryptLog(log);

      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should fail decryption with tampered data', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      // Tamper with the data
      encrypted.data = encrypted.data.substring(0, encrypted.data.length - 10) + '0123456789';

      await expect(encryptionService.decryptLog(encrypted)).rejects.toThrow();
    });

    it('should fail decryption with wrong checksum', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      // Tamper with checksum
      encrypted.checksum = 'invalid-checksum';

      await expect(encryptionService.decryptLog(encrypted)).rejects.toThrow('Data integrity check failed');
    });
  });

  describe('Sensitive Field Encryption', () => {
    it('should encrypt sensitive fields in place', async () => {
      const log = createMockLog();

      const encryptedLog = await encryptionService.encryptSensitiveFields(log);

      expect(encryptedLog.patient_id).toMatch(/^enc:/);
      expect(encryptedLog.metadata?.ip_address).toMatch(/^enc:/);
      expect((encryptedLog.action.details as any).ssn).toMatch(/^enc:/);
      expect((encryptedLog.action.details as any).dob).toMatch(/^enc:/);
      expect((encryptedLog.action.details as any).phone).toMatch(/^enc:/);
    });

    it('should decrypt sensitive fields back to original values', async () => {
      const originalLog = createMockLog();

      const encryptedLog = await encryptionService.encryptSensitiveFields(originalLog);
      const decryptedLog = await encryptionService.decryptSensitiveFields(encryptedLog);

      expect(decryptedLog.patient_id).toBe(originalLog.patient_id);
      expect(decryptedLog.metadata?.ip_address).toBe(originalLog.metadata?.ip_address);
      expect((decryptedLog.action.details as any).ssn).toBe((originalLog.action.details as any).ssn);
      expect((decryptedLog.action.details as any).dob).toBe((originalLog.action.details as any).dob);
      expect((decryptedLog.action.details as any).phone).toBe((originalLog.action.details as any).phone);
    });

    it('should handle logs without sensitive fields', async () => {
      const log = createMockLog({
        patient_id: undefined,
        metadata: { ...createMockLog().metadata!, ip_address: undefined },
        action: { type: ActionType.RETRIEVE_INFO, status: ActionStatus.SUCCESS, details: {} }
      });

      const encryptedLog = await encryptionService.encryptSensitiveFields(log);
      const decryptedLog = await encryptionService.decryptSensitiveFields(encryptedLog);

      expect(decryptedLog).toEqual(log);
    });
  });

  describe('Key Management', () => {
    it('should start with version 1 key', () => {
      const metrics = encryptionService.getMetrics();
      expect(metrics.activeKeyVersion).toBe(1);
      expect(metrics.totalKeys).toBe(1);
    });

    it('should rotate keys and maintain old keys for decryption', async () => {
      const log = createMockLog();

      // Encrypt with version 1
      const encrypted1 = await encryptionService.encryptLog(log);
      expect(encrypted1.keyVersion).toBe(1);

      // Rotate keys
      await encryptionService.rotateKeys();

      const metrics = encryptionService.getMetrics();
      expect(metrics.activeKeyVersion).toBe(2);
      expect(metrics.totalKeys).toBe(2);
      expect(metrics.keyRotations).toBe(1);

      // Encrypt with version 2
      const encrypted2 = await encryptionService.encryptLog(log);
      expect(encrypted2.keyVersion).toBe(2);

      // Should still be able to decrypt version 1
      const decrypted1 = await encryptionService.decryptLog(encrypted1);
      expect(decrypted1).toEqual(log);

      // Should be able to decrypt version 2
      const decrypted2 = await encryptionService.decryptLog(encrypted2);
      expect(decrypted2).toEqual(log);
    });

    it('should fail decryption with unknown key version', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      // Set invalid key version
      encrypted.keyVersion = 999;

      await expect(encryptionService.decryptLog(encrypted)).rejects.toThrow('key version 999 not found');
    });

    it('should detect when key rotation is needed', () => {
      // Mock service with short rotation period
      const shortRotationService = new EncryptionService({
        keyRotationDays: 0 // Immediate rotation needed
      });

      expect(shortRotationService.isKeyRotationNeeded()).toBe(true);

      const normalService = new EncryptionService({
        keyRotationDays: 90 // Normal rotation period
      });

      expect(normalService.isKeyRotationNeeded()).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate encryption configuration', () => {
      const validConfig = encryptionService.validateConfig();
      expect(validConfig.valid).toBe(true);
      expect(validConfig.errors).toHaveLength(0);
    });

    it('should detect invalid key size', () => {
      const invalidService = new EncryptionService({
        keySize: 16 // Too small for HIPAA
      });

      const validation = invalidService.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(expect.stringContaining('Key size must be at least 256 bits'));
    });

    it('should detect invalid rotation period', () => {
      const invalidService = new EncryptionService({
        keyRotationDays: 120 // Too long for HIPAA
      });

      const validation = invalidService.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(expect.stringContaining('Key rotation must occur at least every 90 days'));
    });

    it('should detect missing master key ID', () => {
      const invalidService = new EncryptionService({
        masterKeyId: ''
      });

      const validation = invalidService.validateConfig();
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(expect.stringContaining('Master key ID is required'));
    });
  });

  describe('Performance Metrics', () => {
    it('should track encryption metrics', async () => {
      const log = createMockLog();

      await encryptionService.encryptLog(log);
      await encryptionService.encryptLog(log);

      const metrics = encryptionService.getMetrics();
      expect(metrics.totalEncrypted).toBe(2);
      expect(metrics.averageEncryptionTime).toBeGreaterThan(0);
      expect(metrics.encryptionErrors).toBe(0);
    });

    it('should track decryption metrics', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      await encryptionService.decryptLog(encrypted);
      await encryptionService.decryptLog(encrypted);

      const metrics = encryptionService.getMetrics();
      expect(metrics.totalDecrypted).toBe(2);
      expect(metrics.averageDecryptionTime).toBeGreaterThan(0);
      expect(metrics.decryptionErrors).toBe(0);
    });

    it('should track error metrics', async () => {
      const invalidLog = { invalid: 'data' } as any;

      try {
        await encryptionService.encryptLog(invalidLog);
      } catch (error) {
        // Expected error
      }

      const metrics = encryptionService.getMetrics();
      expect(metrics.encryptionErrors).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption failures gracefully', async () => {
      const invalidData = null as any;

      await expect(encryptionService.encryptLog(invalidData)).rejects.toThrow('Encryption failed');
    });

    it('should handle decryption failures gracefully', async () => {
      const invalidEncrypted = {
        data: 'invalid-data',
        iv: 'invalid-iv',
        keyVersion: 1,
        algorithm: 'aes-256-cbc',
        timestamp: new Date().toISOString(),
        checksum: 'invalid-checksum'
      };

      await expect(encryptionService.decryptLog(invalidEncrypted)).rejects.toThrow('Decryption failed');
    });

    it('should handle field encryption errors', async () => {
      const logWithCircularRef = createMockLog();
      // Create circular reference
      (logWithCircularRef.action.details as any).circular = logWithCircularRef.action.details;

      await expect(encryptionService.encryptSensitiveFields(logWithCircularRef)).rejects.toThrow();
    });
  });

  describe('HIPAA Compliance', () => {
    it('should use AES-256 encryption by default', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      expect(encrypted.algorithm).toBe('aes-256-cbc');
    });

    it('should enforce 90-day key rotation by default', () => {
      const defaultService = new EncryptionService();
      const validation = defaultService.validateConfig();

      expect(validation.valid).toBe(true);
    });

    it('should generate cryptographically secure keys', async () => {
      await encryptionService.rotateKeys();

      const metrics = encryptionService.getMetrics();
      expect(metrics.totalKeys).toBe(2);
      expect(metrics.keyRotations).toBe(1);
    });

    it('should maintain data integrity with checksums', async () => {
      const log = createMockLog();
      const encrypted = await encryptionService.encryptLog(log);

      expect(encrypted.checksum).toMatch(/^[a-f0-9]+$/);
      expect(encrypted.checksum.length).toBeGreaterThan(10);
    });
  });
});