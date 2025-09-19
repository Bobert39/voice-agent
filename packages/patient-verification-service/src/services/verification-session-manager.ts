/**
 * Verification Session Manager
 * 
 * Handles encrypted storage and management of patient verification sessions
 * with HIPAA-compliant security and audit logging
 */

import { createClient } from 'redis';
import { createLogger } from '@ai-voice-agent/shared-utils';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const logger = createLogger('verification-session-manager');

export interface VerificationSession {
  sessionId: string;
  patientId?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastAttemptAt?: Date;
  escalationTriggered: boolean;
}

export interface VerificationAttempt {
  sessionId: string;
  timestamp: Date;
  success: boolean;
  providedData: {
    firstName?: string;
    lastName?: string;
    dob?: string;
    phone?: string;
  };
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class VerificationSessionManager {
  private redisClient;
  private encryptionKey: Buffer;
  private jwtSecret: string;

  constructor() {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    // Initialize encryption key and JWT secret from environment
    const keyHex = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
  }

  async connect(): Promise<void> {
    await this.redisClient.connect();
    logger.info('Connected to Redis for verification session management');
  }

  async disconnect(): Promise<void> {
    await this.redisClient.disconnect();
    logger.info('Disconnected from Redis');
  }

  /**
   * Encrypt sensitive data before storage
   */
  private encrypt(text: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encrypted, iv: iv.toString('hex') };
  }

  /**
   * Decrypt sensitive data from storage
   */
  private decrypt(encryptedData: { encrypted: string; iv: string }): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Create a new verification session
   */
  async createSession(
    sessionId?: string,
    maxAttempts: number = 3,
    sessionTimeoutMinutes: number = 15
  ): Promise<VerificationSession> {
    const session: VerificationSession = {
      sessionId: sessionId || crypto.randomBytes(16).toString('hex'),
      attempts: 0,
      maxAttempts,
      verified: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + sessionTimeoutMinutes * 60 * 1000),
      escalationTriggered: false
    };

    await this.saveSession(session);
    
    logger.info('Created new verification session', {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      maxAttempts
    });

    return session;
  }

  /**
   * Get verification session by ID
   */
  async getSession(sessionId: string): Promise<VerificationSession | null> {
    try {
      const sessionData = await this.redisClient.get(`verification_session:${sessionId}`);
      if (!sessionData) {
        return null;
      }

      const encryptedSession = JSON.parse(sessionData);
      const decryptedData = this.decrypt(encryptedSession);
      const session = JSON.parse(decryptedData);

      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.expiresAt = new Date(session.expiresAt);
      if (session.lastAttemptAt) {
        session.lastAttemptAt = new Date(session.lastAttemptAt);
      }

      // Check if session has expired
      if (session.expiresAt < new Date()) {
        await this.deleteSession(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Error retrieving verification session', { 
        sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Save/update verification session
   */
  async saveSession(session: VerificationSession): Promise<void> {
    try {
      const sessionData = JSON.stringify(session);
      const encryptedData = this.encrypt(sessionData);
      
      const ttl = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
      
      await this.redisClient.setEx(
        `verification_session:${session.sessionId}`,
        ttl,
        JSON.stringify(encryptedData)
      );
    } catch (error) {
      logger.error('Error saving verification session', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Record a verification attempt
   */
  async recordAttempt(
    sessionId: string,
    success: boolean,
    providedData: {
      firstName?: string;
      lastName?: string;
      dob?: string;
      phone?: string;
    },
    failureReason?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<VerificationSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Update session with attempt
    session.attempts += 1;
    session.lastAttemptAt = new Date();
    session.verified = success;

    // Store partial data from successful verification
    if (success) {
      if (providedData.firstName) session.firstName = providedData.firstName;
      if (providedData.lastName) session.lastName = providedData.lastName;
      if (providedData.dob) session.dob = providedData.dob;
      if (providedData.phone) session.phone = providedData.phone;
    }

    // Check if max attempts reached
    if (!success && session.attempts >= session.maxAttempts) {
      session.escalationTriggered = true;
    }

    await this.saveSession(session);

    // Log attempt for audit trail (without PII)
    const auditData = {
      sessionId,
      attemptNumber: session.attempts,
      success,
      timestamp: new Date().toISOString(),
      failureReason: success ? undefined : failureReason,
      escalationTriggered: session.escalationTriggered,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };

    logger.info('Verification attempt recorded', auditData);

    // Also store detailed attempt log for audit
    const attempt: VerificationAttempt = {
      sessionId,
      timestamp: new Date(),
      success,
      providedData: {
        // Hash PII for audit logging
        firstName: providedData.firstName ? this.hashPII(providedData.firstName) : undefined,
        lastName: providedData.lastName ? this.hashPII(providedData.lastName) : undefined,
        dob: providedData.dob ? this.hashPII(providedData.dob) : undefined,
        phone: providedData.phone ? this.hashPII(providedData.phone) : undefined
      },
      failureReason,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    };

    await this.storeAuditAttempt(attempt);

    return session;
  }

  /**
   * Hash PII for audit logging (one-way hash for privacy)
   */
  private hashPII(data: string): string {
    return crypto.createHash('sha256').update(data + 'audit_salt').digest('hex').substring(0, 16);
  }

  /**
   * Store audit attempt for HIPAA compliance
   */
  private async storeAuditAttempt(attempt: VerificationAttempt): Promise<void> {
    try {
      const auditKey = `verification_audit:${attempt.sessionId}:${attempt.timestamp.getTime()}`;
      const auditData = JSON.stringify(attempt);
      const encryptedAudit = this.encrypt(auditData);
      
      // Store audit logs for 7 years (HIPAA requirement)
      const auditTTL = 7 * 365 * 24 * 60 * 60; // 7 years in seconds
      
      await this.redisClient.setEx(
        auditKey,
        auditTTL,
        JSON.stringify(encryptedAudit)
      );
    } catch (error) {
      logger.error('Error storing audit attempt', {
        sessionId: attempt.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate verification token for successful verification
   */
  generateVerificationToken(session: VerificationSession): string {
    if (!session.verified || !session.patientId) {
      throw new Error('Cannot generate token for unverified session');
    }

    const payload = {
      sessionId: session.sessionId,
      patientId: session.patientId,
      verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(session.expiresAt.getTime() / 1000)
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Verify token validity
   */
  verifyToken(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      return { valid: true, payload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid token' 
      };
    }
  }

  /**
   * Check if session needs escalation
   */
  async checkEscalationNeeded(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    return session?.escalationTriggered || false;
  }

  /**
   * Delete expired or completed session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.redisClient.del(`verification_session:${sessionId}`);
      logger.info('Deleted verification session', { sessionId });
    } catch (error) {
      logger.error('Error deleting verification session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const keys = await this.redisClient.keys('verification_session:*');
      let cleanedCount = 0;

      for (const key of keys) {
        const session = await this.getSession(key.replace('verification_session:', ''));
        if (!session) {
          cleanedCount++;
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired verification sessions`);
      return cleanedCount;
    } catch (error) {
      logger.error('Error during session cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Get audit trail for a session (for compliance purposes)
   */
  async getAuditTrail(sessionId: string): Promise<VerificationAttempt[]> {
    try {
      const keys = await this.redisClient.keys(`verification_audit:${sessionId}:*`);
      const attempts: VerificationAttempt[] = [];

      for (const key of keys) {
        const auditData = await this.redisClient.get(key);
        if (auditData) {
          const encryptedAudit = JSON.parse(auditData);
          const decryptedData = this.decrypt(encryptedAudit);
          const attempt = JSON.parse(decryptedData);
          attempt.timestamp = new Date(attempt.timestamp);
          attempts.push(attempt);
        }
      }

      return attempts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      logger.error('Error retrieving audit trail', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }
}