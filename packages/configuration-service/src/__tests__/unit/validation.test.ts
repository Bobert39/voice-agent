import { describe, it, expect } from '@jest/globals';
import { ConfigurationValidator } from '../../utils/validation';

describe('ConfigurationValidator', () => {
  describe('validatePracticeSettings', () => {
    it('should validate valid practice settings', () => {
      const validData = {
        practice_id: 'practice-123',
        setting_key: 'practice_hours',
        setting_value: {
          monday: { open: '09:00', close: '17:00', is_closed: false },
          tuesday: { open: '09:00', close: '17:00', is_closed: false },
          wednesday: { open: '09:00', close: '17:00', is_closed: false },
          thursday: { open: '09:00', close: '17:00', is_closed: false },
          friday: { open: '09:00', close: '17:00', is_closed: false },
          saturday: { open: '09:00', close: '13:00', is_closed: false },
          sunday: { open: '09:00', close: '17:00', is_closed: true },
          timezone: 'America/New_York',
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validatePracticeSettings(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedData).toBeDefined();
    });

    it('should warn about unreasonable hours', () => {
      const dataWithEarlyHours = {
        practice_id: 'practice-123',
        setting_key: 'practice_hours',
        setting_value: {
          monday: { open: '05:00', close: '23:30', is_closed: false },
          tuesday: { open: '09:00', close: '17:00', is_closed: false },
          wednesday: { open: '09:00', close: '17:00', is_closed: false },
          thursday: { open: '09:00', close: '17:00', is_closed: false },
          friday: { open: '09:00', close: '17:00', is_closed: false },
          saturday: { open: '09:00', close: '13:00', is_closed: false },
          sunday: { open: '09:00', close: '17:00', is_closed: true },
          timezone: 'America/New_York',
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validatePracticeSettings(dataWithEarlyHours);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('Very early opening time'))).toBe(true);
      expect(result.warnings.some(w => w.includes('Very late closing time'))).toBe(true);
    });

    it('should warn when practice is closed all days', () => {
      const allClosedData = {
        practice_id: 'practice-123',
        setting_key: 'practice_hours',
        setting_value: {
          monday: { open: '09:00', close: '17:00', is_closed: true },
          tuesday: { open: '09:00', close: '17:00', is_closed: true },
          wednesday: { open: '09:00', close: '17:00', is_closed: true },
          thursday: { open: '09:00', close: '17:00', is_closed: true },
          friday: { open: '09:00', close: '17:00', is_closed: true },
          saturday: { open: '09:00', close: '13:00', is_closed: true },
          sunday: { open: '09:00', close: '17:00', is_closed: true },
          timezone: 'America/New_York',
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validatePracticeSettings(allClosedData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('closed all days'))).toBe(true);
    });

    it('should reject invalid practice settings', () => {
      const invalidData = {
        practice_id: '', // Empty practice ID
        setting_key: 'practice_hours',
        setting_value: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validatePracticeSettings(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateAppointmentType', () => {
    it('should validate valid appointment type', () => {
      const validData = {
        practice_id: 'practice-123',
        type_name: 'Regular Checkup',
        type_code: 'CHECKUP',
        duration_minutes: 30,
        scheduling_rules: {
          advance_booking_days: 30,
          cancellation_hours: 24,
          requires_confirmation: false,
          buffer_minutes_before: 5,
          buffer_minutes_after: 5,
          max_daily_bookings: 20,
          allowed_days: [1, 2, 3, 4, 5],
        },
        conflict_rules: {
          cannot_overlap_with: ['EMERGENCY'],
          requires_gap_minutes: 0,
          priority_level: 5,
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAppointmentType(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about short appointment duration', () => {
      const shortDurationData = {
        practice_id: 'practice-123',
        type_name: 'Quick Visit',
        type_code: 'QUICK',
        duration_minutes: 10, // Short duration
        scheduling_rules: {},
        conflict_rules: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAppointmentType(shortDurationData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('too short'))).toBe(true);
    });

    it('should warn about long appointment duration', () => {
      const longDurationData = {
        practice_id: 'practice-123',
        type_name: 'Surgery',
        type_code: 'SURGERY',
        duration_minutes: 300, // 5 hours
        scheduling_rules: {},
        conflict_rules: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAppointmentType(longDurationData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('unusually long'))).toBe(true);
    });

    it('should warn about excessive buffer time', () => {
      const excessiveBufferData = {
        practice_id: 'practice-123',
        type_name: 'Test Appointment',
        type_code: 'TEST',
        duration_minutes: 30,
        scheduling_rules: {
          buffer_minutes_before: 20,
          buffer_minutes_after: 20,
        },
        conflict_rules: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAppointmentType(excessiveBufferData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('50% of appointment duration'))).toBe(true);
    });
  });

  describe('validateAIPersonality', () => {
    it('should validate valid AI personality', () => {
      const validData = {
        practice_id: 'practice-123',
        personality_name: 'Compassionate Assistant',
        personality_settings: {
          formality_level: 'professional',
          empathy_level: 'high',
          verbosity: 'balanced',
          tone: 'compassionate',
        },
        response_templates: {
          greeting: 'Hello!',
          appointment_confirmation: 'Confirmed',
          appointment_reminder: 'Reminder',
          cancellation_acknowledgment: 'Cancelled',
          error_handling: 'Error',
          escalation_message: 'Escalating',
        },
        conversation_rules: {
          max_conversation_length: 15,
        },
        testing_parameters: {
          success_metrics: {
            conversation_completion_rate: 90,
            patient_satisfaction_threshold: 8,
            error_rate_threshold: 2,
          },
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAIPersonality(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about long conversation length', () => {
      const longConversationData = {
        practice_id: 'practice-123',
        personality_name: 'Test Personality',
        personality_settings: {},
        response_templates: {
          greeting: 'Hello!',
          appointment_confirmation: 'Confirmed',
          appointment_reminder: 'Reminder',
          cancellation_acknowledgment: 'Cancelled',
          error_handling: 'Error',
          escalation_message: 'Escalating',
        },
        conversation_rules: {
          max_conversation_length: 45, // Very long
        },
        testing_parameters: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAIPersonality(longConversationData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('patient fatigue'))).toBe(true);
    });

    it('should warn about low thresholds', () => {
      const lowThresholdsData = {
        practice_id: 'practice-123',
        personality_name: 'Test Personality',
        personality_settings: {},
        response_templates: {
          greeting: 'Hello!',
          appointment_confirmation: 'Confirmed',
          appointment_reminder: 'Reminder',
          cancellation_acknowledgment: 'Cancelled',
          error_handling: 'Error',
          escalation_message: 'Escalating',
        },
        conversation_rules: {},
        testing_parameters: {
          success_metrics: {
            conversation_completion_rate: 70, // Low
            patient_satisfaction_threshold: 5, // Low
            error_rate_threshold: 8, // High
          },
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateAIPersonality(lowThresholdsData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('indicate issues'))).toBe(true);
      expect(result.warnings.some(w => w.includes('too low'))).toBe(true);
      expect(result.warnings.some(w => w.includes('too high'))).toBe(true);
    });
  });

  describe('validateBackupSettings', () => {
    it('should validate valid backup settings', () => {
      const validData = {
        practice_id: 'practice-123',
        backup_type: 'database',
        schedule_cron: '0 2 * * *',
        retention_days: 90,
        backup_location: 's3://backup-bucket',
        encryption_enabled: true,
        compression_enabled: true,
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateBackupSettings(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about short retention period', () => {
      const shortRetentionData = {
        practice_id: 'practice-123',
        backup_type: 'database',
        schedule_cron: '0 2 * * *',
        retention_days: 15, // Short retention
        backup_location: 's3://backup-bucket',
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateBackupSettings(shortRetentionData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('compliance requirements'))).toBe(true);
    });

    it('should warn about database backup without encryption', () => {
      const noEncryptionData = {
        practice_id: 'practice-123',
        backup_type: 'database',
        schedule_cron: '0 2 * * *',
        retention_days: 90,
        backup_location: 's3://backup-bucket',
        encryption_enabled: false, // No encryption for database
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = ConfigurationValidator.validateBackupSettings(noEncryptionData);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('HIPAA compliance'))).toBe(true);
    });
  });

  describe('validateCronExpression', () => {
    it('should validate correct cron expressions', () => {
      const validCronExpressions = [
        '0 2 * * *',    // Daily at 2 AM
        '0 0 * * 0',    // Weekly on Sunday at midnight
        '0 */6 * * *',  // Every 6 hours
        '30 1 1 * *',   // Monthly on 1st at 1:30 AM
      ];

      validCronExpressions.forEach(cron => {
        expect(ConfigurationValidator.validateCronExpression(cron)).toBe(true);
      });
    });

    it('should reject invalid cron expressions', () => {
      const invalidCronExpressions = [
        'invalid',
        '60 0 * * *',   // Invalid minute (60)
        '0 25 * * *',   // Invalid hour (25)
        '0 0 32 * *',   // Invalid day (32)
        '0 0 * 13 *',   // Invalid month (13)
        '0 0 * * 8',    // Invalid day of week (8)
      ];

      invalidCronExpressions.forEach(cron => {
        expect(ConfigurationValidator.validateCronExpression(cron)).toBe(false);
      });
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact sensitive fields', () => {
      const dataWithSensitiveInfo = {
        setting_key: 'email_config',
        setting_value: {
          smtp_host: 'smtp.example.com',
          smtp_password: 'secret123',
          api_key: 'key123',
          notification_emails: ['admin@practice.com'],
        },
        user_token: 'bearer_token_123',
        backup_location: 's3://private-bucket/backups',
      };

      const sanitized = ConfigurationValidator.sanitizeForLogging(dataWithSensitiveInfo);

      expect(sanitized.setting_value.smtp_password).toBe('[REDACTED]');
      expect(sanitized.setting_value.api_key).toBe('[REDACTED]');
      expect(sanitized.setting_value.notification_emails).toBe('[REDACTED]');
      expect(sanitized.backup_location).toBe('[REDACTED]');
      expect(sanitized.setting_value.smtp_host).toBe('smtp.example.com'); // Not sensitive
    });

    it('should handle nested objects', () => {
      const nestedData = {
        level1: {
          level2: {
            password: 'secret',
            public_info: 'not secret',
          },
        },
      };

      const sanitized = ConfigurationValidator.sanitizeForLogging(nestedData);

      expect(sanitized.level1.level2.password).toBe('[REDACTED]');
      expect(sanitized.level1.level2.public_info).toBe('not secret');
    });

    it('should handle arrays', () => {
      const arrayData = {
        items: [
          { name: 'item1', secret: 'secret1' },
          { name: 'item2', secret: 'secret2' },
        ],
      };

      const sanitized = ConfigurationValidator.sanitizeForLogging(arrayData);

      expect(sanitized.items[0].secret).toBe('[REDACTED]');
      expect(sanitized.items[1].secret).toBe('[REDACTED]');
      expect(sanitized.items[0].name).toBe('item1');
      expect(sanitized.items[1].name).toBe('item2');
    });
  });
});