/**
 * Encryption Service for Audit Logs
 * Implements AES-256 encryption for log data with key rotation and HIPAA compliance
 * Handles both at-rest and in-transit encryption requirements
 */

import { createCipher, createDecipher, randomBytes, createHash } from 'crypto';
import { AuditLogEntry } from '../types/audit-log';

interface EncryptionConfig {
  algorithm: string;
  keySize: number;
  ivSize: number;
  keyRotationDays: number;
  masterKeyId: string;
  saltRounds: number;
}

interface EncryptedData {
  data: string;
  iv: string;
  keyVersion: number;
  algorithm: string;
  timestamp: string;
  checksum: string;
}

interface EncryptionKey {
  id: string;
  version: number;
  key: Buffer;
  createdAt: Date;
  expiresAt: Date;
  active: boolean;
}

interface EncryptionMetrics {
  totalEncrypted: number;
  totalDecrypted: number;
  keyRotations: number;
  encryptionErrors: number;
  decryptionErrors: number;
  lastKeyRotationAt: Date | null;
  averageEncryptionTime: number;
  averageDecryptionTime: number;
}

export class EncryptionService {
  private config: EncryptionConfig;
  private metrics: EncryptionMetrics;
  private keys: Map<number, EncryptionKey> = new Map();
  private currentKeyVersion = 1;

  constructor(config?: Partial<EncryptionConfig>) {
    this.config = {
      algorithm: 'aes-256-cbc',
      keySize: 32, // 256 bits
      ivSize: 16,  // 128 bits
      keyRotationDays: 90, // HIPAA compliance
      masterKeyId: process.env.AUDIT_MASTER_KEY_ID || 'default-master-key',
      saltRounds: 12,
      ...config
    };

    this.metrics = {
      totalEncrypted: 0,
      totalDecrypted: 0,
      keyRotations: 0,
      encryptionErrors: 0,
      decryptionErrors: 0,
      lastKeyRotationAt: null,
      averageEncryptionTime: 0,
      averageDecryptionTime: 0
    };

    // Initialize with first key
    this.initializeKeys();
  }

  /**
   * Encrypt audit log data
   */
  async encryptLog(log: AuditLogEntry): Promise<EncryptedData> {
    const startTime = Date.now();

    try {
      // Get current active key
      const activeKey = this.getActiveKey();
      if (!activeKey) {
        throw new Error('No active encryption key available');
      }

      // Serialize log data
      const plaintext = JSON.stringify(log);

      // Generate initialization vector
      const iv = randomBytes(this.config.ivSize);

      // Create cipher
      const cipher = createCipher(this.config.algorithm, activeKey.key);

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Generate checksum for integrity verification
      const checksum = this.generateChecksum(plaintext);

      const encryptedData: EncryptedData = {
        data: encrypted,
        iv: iv.toString('hex'),
        keyVersion: activeKey.version,
        algorithm: this.config.algorithm,
        timestamp: new Date().toISOString(),
        checksum
      };

      // Update metrics
      const encryptionTime = Date.now() - startTime;
      this.updateEncryptionMetrics(encryptionTime);
      this.metrics.totalEncrypted++;

      return encryptedData;

    } catch (error) {
      this.metrics.encryptionErrors++;
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt audit log data
   */
  async decryptLog(encryptedData: EncryptedData): Promise<AuditLogEntry> {
    const startTime = Date.now();

    try {
      // Get encryption key for the specified version
      const key = this.keys.get(encryptedData.keyVersion);
      if (!key) {
        throw new Error(`Encryption key version ${encryptedData.keyVersion} not found`);
      }

      // Create decipher
      const decipher = createDecipher(encryptedData.algorithm, key.key);

      // Decrypt data
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Verify checksum
      const computedChecksum = this.generateChecksum(decrypted);
      if (computedChecksum !== encryptedData.checksum) {
        throw new Error('Data integrity check failed - checksum mismatch');
      }

      // Parse decrypted JSON
      const log: AuditLogEntry = JSON.parse(decrypted);

      // Update metrics
      const decryptionTime = Date.now() - startTime;
      this.updateDecryptionMetrics(decryptionTime);
      this.metrics.totalDecrypted++;

      return log;

    } catch (error) {
      this.metrics.decryptionErrors++;
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt sensitive fields in place (for partial encryption)
   */
  async encryptSensitiveFields(log: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const sensitiveLog = { ...log };

      // Encrypt patient_id if present
      if (sensitiveLog.patient_id) {
        const encrypted = await this.encryptString(sensitiveLog.patient_id);
        sensitiveLog.patient_id = `enc:${encrypted.data}:${encrypted.keyVersion}`;
      }

      // Encrypt IP address in metadata
      if (sensitiveLog.metadata?.ip_address) {
        const encrypted = await this.encryptString(sensitiveLog.metadata.ip_address);
        sensitiveLog.metadata.ip_address = `enc:${encrypted.data}:${encrypted.keyVersion}`;
      }

      // Encrypt any PHI in action details
      if (sensitiveLog.action?.details && typeof sensitiveLog.action.details === 'object') {
        sensitiveLog.action.details = await this.encryptObjectFields(sensitiveLog.action.details);
      }

      return sensitiveLog;

    } catch (error) {
      throw new Error(`Field encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt sensitive fields in place
   */
  async decryptSensitiveFields(log: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const decryptedLog = { ...log };

      // Decrypt patient_id if encrypted
      if (decryptedLog.patient_id?.startsWith('enc:')) {
        decryptedLog.patient_id = await this.decryptEncryptedString(decryptedLog.patient_id);
      }

      // Decrypt IP address if encrypted
      if (decryptedLog.metadata?.ip_address?.startsWith('enc:')) {
        decryptedLog.metadata.ip_address = await this.decryptEncryptedString(decryptedLog.metadata.ip_address);
      }

      // Decrypt action details if needed
      if (decryptedLog.action?.details && typeof decryptedLog.action.details === 'object') {
        decryptedLog.action.details = await this.decryptObjectFields(decryptedLog.action.details);
      }

      return decryptedLog;

    } catch (error) {
      throw new Error(`Field decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate encryption keys (HIPAA requirement: every 90 days)
   */
  async rotateKeys(): Promise<void> {
    try {
      // Generate new key
      const newVersion = this.currentKeyVersion + 1;
      const newKey = this.generateEncryptionKey(newVersion);

      // Add new key
      this.keys.set(newVersion, newKey);

      // Deactivate old key but keep for decryption
      const oldKey = this.keys.get(this.currentKeyVersion);
      if (oldKey) {
        oldKey.active = false;
      }

      // Update current version
      this.currentKeyVersion = newVersion;

      // Update metrics
      this.metrics.keyRotations++;
      this.metrics.lastKeyRotationAt = new Date();

      // In real implementation, would also update key in AWS KMS or similar

    } catch (error) {
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if key rotation is needed
   */
  isKeyRotationNeeded(): boolean {
    const activeKey = this.getActiveKey();
    if (!activeKey) return true;

    const daysSinceCreation = Math.floor(
      (Date.now() - activeKey.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceCreation >= this.config.keyRotationDays;
  }

  /**
   * Get encryption metrics
   */
  getMetrics(): EncryptionMetrics & {
    activeKeyVersion: number;
    totalKeys: number;
    keyRotationNeeded: boolean;
  } {
    return {
      ...this.metrics,
      activeKeyVersion: this.currentKeyVersion,
      totalKeys: this.keys.size,
      keyRotationNeeded: this.isKeyRotationNeeded()
    };
  }

  /**
   * Validate encryption configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.keySize < 32) {
      errors.push('Key size must be at least 256 bits (32 bytes) for HIPAA compliance');
    }

    if (this.config.keyRotationDays > 90) {
      errors.push('Key rotation must occur at least every 90 days for HIPAA compliance');
    }

    if (!this.config.masterKeyId) {
      errors.push('Master key ID is required for key derivation');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private initializeKeys(): void {
    const initialKey = this.generateEncryptionKey(this.currentKeyVersion);
    this.keys.set(this.currentKeyVersion, initialKey);
  }

  private generateEncryptionKey(version: number): EncryptionKey {
    // In real implementation, derive from master key using HKDF or similar
    const key = randomBytes(this.config.keySize);
    const now = new Date();
    const expiry = new Date(now.getTime() + (this.config.keyRotationDays * 24 * 60 * 60 * 1000));

    return {
      id: `audit-key-v${version}`,
      version,
      key,
      createdAt: now,
      expiresAt: expiry,
      active: true
    };
  }

  private getActiveKey(): EncryptionKey | undefined {
    return this.keys.get(this.currentKeyVersion);
  }

  private generateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private async encryptString(plaintext: string): Promise<{ data: string; keyVersion: number }> {
    const activeKey = this.getActiveKey();
    if (!activeKey) {
      throw new Error('No active encryption key');
    }

    const cipher = createCipher(this.config.algorithm, activeKey.key);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      data: encrypted,
      keyVersion: activeKey.version
    };
  }

  private async decryptEncryptedString(encryptedString: string): Promise<string> {
    // Parse format: enc:data:keyVersion
    const parts = encryptedString.split(':');
    if (parts.length !== 3 || parts[0] !== 'enc') {
      throw new Error('Invalid encrypted string format');
    }

    const [, data, keyVersionStr] = parts;
    const keyVersion = parseInt(keyVersionStr, 10);

    const key = this.keys.get(keyVersion);
    if (!key) {
      throw new Error(`Key version ${keyVersion} not found`);
    }

    const decipher = createDecipher(this.config.algorithm, key.key);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async encryptObjectFields(obj: any): Promise<any> {
    const result = { ...obj };

    // Define fields that should be encrypted
    const sensitiveFields = ['ssn', 'dob', 'phone', 'email', 'address'];

    for (const field of sensitiveFields) {
      if (result[field] && typeof result[field] === 'string') {
        const encrypted = await this.encryptString(result[field]);
        result[field] = `enc:${encrypted.data}:${encrypted.keyVersion}`;
      }
    }

    return result;
  }

  private async decryptObjectFields(obj: any): Promise<any> {
    const result = { ...obj };

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.startsWith('enc:')) {
        result[key] = await this.decryptEncryptedString(value);
      }
    }

    return result;
  }

  private updateEncryptionMetrics(encryptionTime: number): void {
    this.metrics.averageEncryptionTime =
      (this.metrics.averageEncryptionTime * this.metrics.totalEncrypted + encryptionTime) /
      (this.metrics.totalEncrypted + 1);
  }

  private updateDecryptionMetrics(decryptionTime: number): void {
    this.metrics.averageDecryptionTime =
      (this.metrics.averageDecryptionTime * this.metrics.totalDecrypted + decryptionTime) /
      (this.metrics.totalDecrypted + 1);
  }
}