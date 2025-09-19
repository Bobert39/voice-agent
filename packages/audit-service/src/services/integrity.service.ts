/**
 * Integrity service for tamper-proof audit logging
 * Implements SHA-256 hashing and chain of custody for log entries
 */

import crypto from 'crypto';
import { AuditLogEntry } from '../types/audit-log';

export interface IntegrityData {
  hash: string;
  previous_hash?: string;
  salt: string;
  algorithm: string;
  timestamp: string;
}

export class IntegrityService {
  private encryptionKey: string;
  private algorithm = 'sha256';

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.AUDIT_ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Generate integrity data for a log entry
   */
  async generateIntegrityData(logEntry: AuditLogEntry, previousHash?: string): Promise<IntegrityData> {
    const salt = this.generateSalt();
    const hash = this.generateHash(logEntry, salt);

    return {
      hash,
      previous_hash: previousHash,
      salt,
      algorithm: this.algorithm,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Verify the integrity of a log entry
   */
  async verifyIntegrity(logEntry: AuditLogEntry): Promise<boolean> {
    if (!logEntry.integrity) {
      return false;
    }

    // Create a copy without integrity data for verification
    const logForVerification = { ...logEntry };
    delete logForVerification.integrity;

    // Recalculate hash
    const calculatedHash = this.generateHash(logForVerification, logEntry.integrity.salt);

    return calculatedHash === logEntry.integrity.hash;
  }

  /**
   * Verify chain of custody between consecutive log entries
   */
  async verifyChain(currentEntry: AuditLogEntry, previousEntry: AuditLogEntry): Promise<boolean> {
    if (!currentEntry.integrity || !previousEntry.integrity) {
      return false;
    }

    return currentEntry.integrity.previous_hash === previousEntry.integrity.hash;
  }

  /**
   * Generate SHA-256 hash for log entry
   */
  private generateHash(logEntry: Partial<AuditLogEntry>, salt: string): string {
    // Create deterministic string representation
    const dataToHash = this.createHashableString(logEntry, salt);

    return crypto
      .createHash(this.algorithm)
      .update(dataToHash + this.encryptionKey)
      .digest('hex');
  }

  /**
   * Generate cryptographically secure salt
   */
  private generateSalt(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create deterministic string representation for hashing
   */
  private createHashableString(logEntry: Partial<AuditLogEntry>, salt: string): string {
    // Create ordered representation to ensure consistent hashing
    const orderedData = {
      timestamp: logEntry.timestamp,
      log_level: logEntry.log_level,
      category: logEntry.category,
      event_type: logEntry.event_type,
      service: logEntry.service,
      action: this.sortObject(logEntry.action),
      patient_id: logEntry.patient_id,
      session_id: logEntry.session_id,
      metadata: this.sortObject(logEntry.metadata),
      phi_accessed: logEntry.phi_accessed,
      audit_trail: this.sortObject(logEntry.audit_trail),
      salt
    };

    return JSON.stringify(orderedData, Object.keys(orderedData).sort());
  }

  /**
   * Recursively sort object properties for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        sorted[key] = this.sortObject(obj[key]);
      });

    return sorted;
  }

  /**
   * Encrypt sensitive log data (additional protection beyond hashing)
   */
  async encryptLogData(data: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt log data
   */
  async decryptLogData(encryptedData: string): Promise<string> {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate integrity report for a series of log entries
   */
  async generateIntegrityReport(logEntries: AuditLogEntry[]): Promise<{
    totalEntries: number;
    validEntries: number;
    invalidEntries: number;
    chainBreaks: number;
    details: Array<{
      index: number;
      timestamp: string;
      isValid: boolean;
      chainValid: boolean;
      errors: string[];
    }>;
  }> {
    const details: Array<{
      index: number;
      timestamp: string;
      isValid: boolean;
      chainValid: boolean;
      errors: string[];
    }> = [];

    let validEntries = 0;
    let chainBreaks = 0;

    for (let i = 0; i < logEntries.length; i++) {
      const entry = logEntries[i];
      const errors: string[] = [];

      // Verify individual entry integrity
      const isValid = await this.verifyIntegrity(entry);
      if (isValid) {
        validEntries++;
      } else {
        errors.push('Hash verification failed');
      }

      // Verify chain of custody (skip first entry)
      let chainValid = true;
      if (i > 0) {
        chainValid = await this.verifyChain(entry, logEntries[i - 1]);
        if (!chainValid) {
          chainBreaks++;
          errors.push('Chain of custody broken');
        }
      }

      details.push({
        index: i,
        timestamp: entry.timestamp,
        isValid,
        chainValid,
        errors
      });
    }

    return {
      totalEntries: logEntries.length,
      validEntries,
      invalidEntries: logEntries.length - validEntries,
      chainBreaks,
      details
    };
  }
}