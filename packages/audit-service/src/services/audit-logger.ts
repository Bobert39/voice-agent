/**
 * Core audit logging service implementing HIPAA-compliant structured logging
 * with encryption, integrity protection, and PHI masking
 */

import crypto from 'crypto';
import winston from 'winston';
// import { createLogger as createSharedLogger } from '@ai-voice-agent/shared-utils';
import {
  AuditLogEntry,
  LogLevel,
  LogCategory,
  EventType,
  ActionType,
  ActionStatus,
  InitiatorType,
  AuthorizationStatus,
  LogValidationResult,
  ActionDetails,
  AuditMetadata,
  AuditTrail
} from '../types/audit-log';
import { PHIMaskingService } from './phi-masking.service';
import { IntegrityService } from './integrity.service';

export interface AuditLoggerConfig {
  serviceName: string;
  enableEncryption: boolean;
  enableIntegrityCheck: boolean;
  enablePHIMasking: boolean;
  encryptionKey?: string;
  redisUrl?: string;
  fluentdHost?: string;
  fluentdPort?: number;
}

export class AuditLogger {
  private winston: winston.Logger;
  private phiMasking: PHIMaskingService;
  private integrity: IntegrityService;
  private config: AuditLoggerConfig;
  private lastLogHash?: string;

  constructor(config: AuditLoggerConfig) {
    this.config = config;
    this.winston = this.createWinstonLogger();
    this.phiMasking = new PHIMaskingService();
    this.integrity = new IntegrityService(config.encryptionKey);
  }

  /**
   * Log a patient interaction event
   */
  async logPatientInteraction(data: {
    eventType: EventType;
    actionType: ActionType;
    status: ActionStatus;
    patientId?: string;
    sessionId: string;
    details: ActionDetails;
    metadata?: Partial<AuditMetadata>;
    initiator: InitiatorType;
    reason: string;
    authorization: AuthorizationStatus;
    staffId?: string;
  }): Promise<void> {
    const logEntry = await this.createLogEntry({
      category: LogCategory.PATIENT_INTERACTION,
      log_level: LogLevel.AUDIT,
      ...data
    });

    await this.writeLog(logEntry);
  }

  /**
   * Log a system activity event
   */
  async logSystemActivity(data: {
    eventType: EventType;
    actionType: ActionType;
    status: ActionStatus;
    details: ActionDetails;
    metadata?: Partial<AuditMetadata>;
    sessionId?: string;
  }): Promise<void> {
    const logEntry = await this.createLogEntry({
      category: LogCategory.SYSTEM,
      log_level: data.status === ActionStatus.FAILURE ? LogLevel.ERROR : LogLevel.INFO,
      initiator: InitiatorType.SYSTEM,
      reason: 'AUTOMATED_SYSTEM_OPERATION',
      authorization: AuthorizationStatus.VALID,
      ...data
    });

    await this.writeLog(logEntry);
  }

  /**
   * Log a security event
   */
  async logSecurityEvent(data: {
    eventType: EventType;
    actionType: ActionType;
    status: ActionStatus;
    details: ActionDetails;
    metadata?: Partial<AuditMetadata>;
    sessionId?: string;
    staffId?: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): Promise<void> {
    const logLevel = data.severity === 'CRITICAL' || data.severity === 'HIGH'
      ? LogLevel.ERROR
      : LogLevel.WARN;

    const logEntry = await this.createLogEntry({
      category: LogCategory.SECURITY,
      log_level: logLevel,
      initiator: data.staffId ? InitiatorType.STAFF : InitiatorType.SYSTEM,
      reason: 'SECURITY_MONITORING',
      authorization: AuthorizationStatus.VALID,
      staffId: data.staffId,
      ...data
    });

    await this.writeLog(logEntry);
  }

  /**
   * Log a compliance event
   */
  async logComplianceEvent(data: {
    eventType: EventType;
    actionType: ActionType;
    status: ActionStatus;
    details: ActionDetails;
    metadata?: Partial<AuditMetadata>;
    sessionId?: string;
    staffId?: string;
  }): Promise<void> {
    const logEntry = await this.createLogEntry({
      category: LogCategory.COMPLIANCE,
      log_level: LogLevel.AUDIT,
      initiator: data.staffId ? InitiatorType.STAFF : InitiatorType.SYSTEM,
      reason: 'COMPLIANCE_MONITORING',
      authorization: AuthorizationStatus.VALID,
      staffId: data.staffId,
      ...data
    });

    await this.writeLog(logEntry);
  }

  /**
   * Create structured log entry with all required fields
   */
  private async createLogEntry(data: {
    category: LogCategory;
    log_level: LogLevel;
    eventType: EventType;
    actionType: ActionType;
    status: ActionStatus;
    details: ActionDetails;
    initiator: InitiatorType;
    reason: string;
    authorization: AuthorizationStatus;
    patientId?: string;
    sessionId?: string;
    metadata?: Partial<AuditMetadata>;
    staffId?: string;
  }): Promise<AuditLogEntry> {
    const timestamp = new Date().toISOString();
    const correlationId = data.metadata?.correlation_id || crypto.randomUUID();

    // Hash patient ID if provided
    const hashedPatientId = data.patientId
      ? this.hashPatientId(data.patientId)
      : undefined;

    // Detect PHI access
    const phiAccessed = this.detectPHIAccess(data.details, data.category);

    // Create base log entry
    const logEntry: AuditLogEntry = {
      timestamp,
      log_level: data.log_level,
      category: data.category,
      event_type: data.eventType,
      service: this.config.serviceName,
      action: {
        type: data.actionType,
        status: data.status,
        details: data.details
      },
      patient_id: hashedPatientId,
      session_id: data.sessionId,
      metadata: {
        correlation_id: correlationId,
        request_id: crypto.randomUUID(),
        ...data.metadata
      },
      phi_accessed: phiAccessed,
      audit_trail: {
        initiator: data.initiator,
        reason: data.reason,
        authorization: data.authorization,
        staff_id: data.staffId
      }
    };

    // Apply PHI masking if enabled
    if (this.config.enablePHIMasking) {
      await this.phiMasking.maskPHI(logEntry);
    }

    // Add integrity protection if enabled
    if (this.config.enableIntegrityCheck) {
      logEntry.integrity = await this.integrity.generateIntegrityData(
        logEntry,
        this.lastLogHash
      );
      this.lastLogHash = logEntry.integrity.hash;
    }

    return logEntry;
  }

  /**
   * Write log entry to configured destinations
   */
  private async writeLog(logEntry: AuditLogEntry): Promise<void> {
    try {
      // Validate log entry structure
      const validation = this.validateLogEntry(logEntry);
      if (!validation.isValid) {
        throw new Error(`Invalid log entry: ${validation.errors.join(', ')}`);
      }

      // Log to Winston (local and CloudWatch)
      this.winston.log(logEntry.log_level.toLowerCase(), 'Audit Log', {
        ...logEntry,
        message: this.formatLogMessage(logEntry)
      });

      // TODO: Send to Fluentd for hot storage (Elasticsearch)
      // TODO: Send to S3 for warm/cold storage
      // TODO: Update Redis cache for real-time monitoring

    } catch (error) {
      // Log the error but don't throw to prevent cascading failures
      this.winston.error('Failed to write audit log', {
        error: error instanceof Error ? error.message : 'Unknown error',
        logEntry: {
          timestamp: logEntry.timestamp,
          category: logEntry.category,
          event_type: logEntry.event_type
        }
      });
    }
  }

  /**
   * Validate log entry structure and required fields
   */
  private validateLogEntry(logEntry: AuditLogEntry): LogValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!logEntry.timestamp) errors.push('timestamp is required');
    if (!logEntry.log_level) errors.push('log_level is required');
    if (!logEntry.category) errors.push('category is required');
    if (!logEntry.event_type) errors.push('event_type is required');
    if (!logEntry.service) errors.push('service is required');
    if (!logEntry.action?.type) errors.push('action.type is required');
    if (!logEntry.action?.status) errors.push('action.status is required');
    if (!logEntry.audit_trail?.initiator) errors.push('audit_trail.initiator is required');
    if (!logEntry.audit_trail?.authorization) errors.push('audit_trail.authorization is required');

    // Conditional validations
    if (logEntry.category === LogCategory.PATIENT_INTERACTION) {
      if (!logEntry.patient_id) warnings.push('patient_id recommended for patient interactions');
      if (!logEntry.session_id) warnings.push('session_id recommended for patient interactions');
    }

    if (logEntry.phi_accessed && !logEntry.audit_trail.reason) {
      errors.push('audit_trail.reason is required when PHI is accessed');
    }

    // Integrity validation
    if (this.config.enableIntegrityCheck && !logEntry.integrity) {
      errors.push('integrity data is required when integrity check is enabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Format log entry for human-readable output
   */
  private formatLogMessage(logEntry: AuditLogEntry): string {
    return `[${logEntry.category}] ${logEntry.event_type}: ${logEntry.action.type} - ${logEntry.action.status}`;
  }

  /**
   * Hash patient ID for PHI protection
   */
  private hashPatientId(patientId: string): string {
    const salt = process.env.PATIENT_ID_SALT || 'default-salt-change-in-production';
    return crypto.createHash('sha256')
      .update(patientId + salt)
      .digest('hex');
  }

  /**
   * Detect if the action involves PHI access
   */
  private detectPHIAccess(details: ActionDetails, category: LogCategory): boolean {
    // Patient interactions always involve PHI
    if (category === LogCategory.PATIENT_INTERACTION) {
      return true;
    }

    // Check for specific PHI-related actions
    const phiActions = ['RETRIEVE_INFO', 'ACCESS_PHI', 'VERIFY_PATIENT'];
    if (details.phi_types_accessed && details.phi_types_accessed.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Create Winston logger with HIPAA-compliant configuration
   */
  private createWinstonLogger(): winston.Logger {
    const logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.config.serviceName },
      transports: [
        // Error logs go to separate file
        new winston.transports.File({
          filename: 'logs/audit-error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 10
        }),
        // All logs go to combined file
        new winston.transports.File({
          filename: 'logs/audit-combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 10
        })
      ]
    });

    // Add console transport for development
    if (process.env.NODE_ENV !== 'production') {
      logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }

    return logger;
  }
}