import { z } from 'zod';
import winston from 'winston';
import {
  PracticeSettingsSchema,
  AppointmentTypeSchema,
  AIPersonalitySchema,
  BackupSettingsSchema,
  UpdatePolicySchema,
  PracticeHours,
  StaffSchedule,
} from '../models/configuration.models';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData?: any;
}

export class ConfigurationValidator {
  /**
   * Validate practice settings configuration
   */
  public static validatePracticeSettings(data: any): ValidationResult {
    try {
      const result = PracticeSettingsSchema.parse(data);
      const warnings = this.validatePracticeSettingsBusinessRules(result);

      return {
        isValid: true,
        errors: [],
        warnings,
        sanitizedData: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: [],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate appointment type configuration
   */
  public static validateAppointmentType(data: any): ValidationResult {
    try {
      const result = AppointmentTypeSchema.parse(data);
      const warnings = this.validateAppointmentTypeBusinessRules(result);

      return {
        isValid: true,
        errors: [],
        warnings,
        sanitizedData: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: [],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate AI personality configuration
   */
  public static validateAIPersonality(data: any): ValidationResult {
    try {
      const result = AIPersonalitySchema.parse(data);
      const warnings = this.validateAIPersonalityBusinessRules(result);

      return {
        isValid: true,
        errors: [],
        warnings,
        sanitizedData: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: [],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate backup settings configuration
   */
  public static validateBackupSettings(data: any): ValidationResult {
    try {
      const result = BackupSettingsSchema.parse(data);
      const warnings = this.validateBackupSettingsBusinessRules(result);

      return {
        isValid: true,
        errors: [],
        warnings,
        sanitizedData: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: [],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate update policy configuration
   */
  public static validateUpdatePolicy(data: any): ValidationResult {
    try {
      const result = UpdatePolicySchema.parse(data);
      const warnings = this.validateUpdatePolicyBusinessRules(result);

      return {
        isValid: true,
        errors: [],
        warnings,
        sanitizedData: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: [],
        };
      }
      return {
        isValid: false,
        errors: ['Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Validate cron expression
   */
  public static validateCronExpression(cronExpression: string): boolean {
    // Simple cron validation - in production, use a proper cron parser
    const cronPattern = /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|[12]\d|3[01])) (\*|([01]?\d)) (\*|([0-6]))$/;
    return cronPattern.test(cronExpression);
  }

  /**
   * Validate practice hours business rules
   */
  private static validatePracticeSettingsBusinessRules(data: any): string[] {
    const warnings: string[] = [];

    if (data.setting_key === 'practice_hours' && data.setting_value) {
      const hours = data.setting_value as PracticeHours;

      // Check if practice is closed all days
      const allDaysClosed = Object.values(hours).every((day: any) =>
        day && typeof day === 'object' && day.is_closed === true
      );
      if (allDaysClosed) {
        warnings.push('Practice appears to be closed all days of the week');
      }

      // Check for reasonable hours
      Object.entries(hours).forEach(([dayName, dayHours]) => {
        if (dayName !== 'timezone' && dayName !== 'holidays' && dayHours && typeof dayHours === 'object') {
          const { open, close, is_closed } = dayHours as any;
          if (!is_closed && open && close) {
            const openTime = new Date(`2000-01-01 ${open}`);
            const closeTime = new Date(`2000-01-01 ${close}`);

            if (openTime >= closeTime) {
              warnings.push(`${dayName}: Open time (${open}) is not before close time (${close})`);
            }

            // Warn about very early or very late hours
            if (openTime.getHours() < 6) {
              warnings.push(`${dayName}: Very early opening time (${open})`);
            }
            if (closeTime.getHours() > 22) {
              warnings.push(`${dayName}: Very late closing time (${close})`);
            }
          }
        }
      });
    }

    return warnings;
  }

  /**
   * Validate appointment type business rules
   */
  private static validateAppointmentTypeBusinessRules(data: any): string[] {
    const warnings: string[] = [];

    // Check for reasonable appointment duration
    if (data.duration_minutes < 15) {
      warnings.push('Appointment duration less than 15 minutes may be too short');
    }
    if (data.duration_minutes > 240) {
      warnings.push('Appointment duration more than 4 hours is unusually long');
    }

    // Check booking rules
    if (data.scheduling_rules?.advance_booking_days > 180) {
      warnings.push('Advance booking more than 6 months may be excessive');
    }

    if (data.scheduling_rules?.cancellation_hours > 72) {
      warnings.push('Cancellation notice more than 72 hours may be excessive');
    }

    // Check buffer times
    const totalBuffer = (data.scheduling_rules?.buffer_minutes_before || 0) +
                       (data.scheduling_rules?.buffer_minutes_after || 0);
    if (totalBuffer >= data.duration_minutes * 0.5) {
      warnings.push('Buffer time is more than 50% of appointment duration');
    }

    return warnings;
  }

  /**
   * Validate AI personality business rules
   */
  private static validateAIPersonalityBusinessRules(data: any): string[] {
    const warnings: string[] = [];

    // Check conversation length
    if (data.conversation_rules?.max_conversation_length > 30) {
      warnings.push('Maximum conversation length over 30 minutes may lead to patient fatigue');
    }

    // Check success metrics thresholds
    const metrics = data.testing_parameters?.success_metrics;
    if (metrics) {
      if (metrics.conversation_completion_rate < 80) {
        warnings.push('Conversation completion rate threshold below 80% may indicate issues');
      }
      if (metrics.patient_satisfaction_threshold < 7) {
        warnings.push('Patient satisfaction threshold below 7 may be too low');
      }
      if (metrics.error_rate_threshold > 5) {
        warnings.push('Error rate threshold above 5% may be too high');
      }
    }

    return warnings;
  }

  /**
   * Validate backup settings business rules
   */
  private static validateBackupSettingsBusinessRules(data: any): string[] {
    const warnings: string[] = [];

    // Validate cron expression
    if (!this.validateCronExpression(data.schedule_cron)) {
      warnings.push('Invalid cron expression format');
    }

    // Check retention period
    if (data.retention_days < 30) {
      warnings.push('Backup retention less than 30 days may not meet compliance requirements');
    }
    if (data.retention_days > 2555) { // 7 years
      warnings.push('Backup retention more than 7 years may be excessive');
    }

    // Check backup type specific requirements
    if (data.backup_type === 'database' && !data.encryption_enabled) {
      warnings.push('Database backups should be encrypted for HIPAA compliance');
    }

    return warnings;
  }

  /**
   * Validate update policy business rules
   */
  private static validateUpdatePolicyBusinessRules(data: any): string[] {
    const warnings: string[] = [];

    // Check auto-approval settings
    if (data.auto_approve_minor && !data.auto_approve_patch) {
      warnings.push('Auto-approving minor updates without patch updates is unusual');
    }

    // Check rollback conditions
    const rollback = data.rollback_conditions;
    if (rollback) {
      if (rollback.error_rate_threshold > 10) {
        warnings.push('Error rate threshold for rollback above 10% may be too high');
      }
      if (rollback.success_rate_threshold < 90) {
        warnings.push('Success rate threshold for rollback below 90% may be too low');
      }
      if (rollback.response_time_threshold > 5000) {
        warnings.push('Response time threshold for rollback above 5 seconds may be too high');
      }
    }

    // Check maintenance windows
    if (data.maintenance_windows?.length === 0) {
      warnings.push('No maintenance windows defined - updates may occur during business hours');
    }

    return warnings;
  }

  /**
   * Sanitize sensitive data for logging
   */
  public static sanitizeForLogging(data: any): any {
    const sanitized = { ...data };

    // Remove or mask sensitive fields
    const sensitiveFields = [
      'password', 'api_key', 'secret', 'token', 'private_key',
      'notification_emails', 'backup_location'
    ];

    function recursiveSanitize(obj: any): any {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      const result: any = Array.isArray(obj) ? [] : {};

      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          result[key] = recursiveSanitize(value);
        } else {
          result[key] = value;
        }
      }

      return result;
    }

    return recursiveSanitize(sanitized);
  }
}

export default ConfigurationValidator;