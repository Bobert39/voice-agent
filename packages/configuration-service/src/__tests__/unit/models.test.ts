import { describe, it, expect } from '@jest/globals';
import {
  PracticeSettingsSchema,
  AppointmentTypeSchema,
  AIPersonalitySchema,
  BackupSettingsSchema,
  UpdatePolicySchema,
  CreateConfigurationRequestSchema,
  UpdateConfigurationRequestSchema,
} from '../../models/configuration.models';

describe('Configuration Models', () => {
  describe('PracticeSettingsSchema', () => {
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

      const result = PracticeSettingsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid practice settings', () => {
      const invalidData = {
        practice_id: '', // Empty practice ID
        setting_key: 'practice_hours',
        setting_value: {},
        // Missing required fields
      };

      const result = PracticeSettingsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('AppointmentTypeSchema', () => {
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
        description: 'Regular health checkup appointment',
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = AppointmentTypeSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject appointment type with invalid duration', () => {
      const invalidData = {
        practice_id: 'practice-123',
        type_name: 'Quick Visit',
        type_code: 'QUICK',
        duration_minutes: 2, // Too short
        scheduling_rules: {},
        conflict_rules: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = AppointmentTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject appointment type with invalid duration too long', () => {
      const invalidData = {
        practice_id: 'practice-123',
        type_name: 'Surgery',
        type_code: 'SURGERY',
        duration_minutes: 500, // Too long (>480)
        scheduling_rules: {},
        conflict_rules: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = AppointmentTypeSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('AIPersonalitySchema', () => {
    it('should validate valid AI personality configuration', () => {
      const validData = {
        practice_id: 'practice-123',
        personality_name: 'Compassionate Assistant',
        personality_settings: {
          formality_level: 'professional',
          empathy_level: 'high',
          verbosity: 'balanced',
          tone: 'compassionate',
          cultural_adaptation: true,
          language_preference: 'en',
        },
        response_templates: {
          greeting: 'Hello! How can I help you today?',
          appointment_confirmation: 'Your appointment has been confirmed.',
          appointment_reminder: 'You have an appointment tomorrow.',
          cancellation_acknowledgment: 'Your appointment has been cancelled.',
          error_handling: 'I apologize, but I encountered an error.',
          escalation_message: 'Let me connect you with a staff member.',
        },
        conversation_rules: {
          max_conversation_length: 15,
          escalation_triggers: ['complaint', 'emergency'],
          prohibited_topics: ['medical advice', 'prescription'],
          required_confirmations: ['appointment_booking', 'appointment_cancellation'],
        },
        testing_parameters: {
          test_scenarios: ['booking', 'cancellation', 'rescheduling'],
          success_metrics: {
            conversation_completion_rate: 90,
            patient_satisfaction_threshold: 8,
            error_rate_threshold: 2,
          },
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = AIPersonalitySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject AI personality with invalid formality level', () => {
      const invalidData = {
        practice_id: 'practice-123',
        personality_name: 'Test Personality',
        personality_settings: {
          formality_level: 'super_casual', // Invalid enum value
          empathy_level: 'high',
          verbosity: 'balanced',
          tone: 'compassionate',
        },
        response_templates: {},
        conversation_rules: {},
        testing_parameters: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = AIPersonalitySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('BackupSettingsSchema', () => {
    it('should validate valid backup settings', () => {
      const validData = {
        practice_id: 'practice-123',
        backup_type: 'database',
        schedule_cron: '0 2 * * *', // Daily at 2 AM
        retention_days: 90,
        backup_location: 's3://backup-bucket/practice-123',
        encryption_enabled: true,
        compression_enabled: true,
        notification_emails: ['admin@practice.com'],
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = BackupSettingsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject backup settings with invalid type', () => {
      const invalidData = {
        practice_id: 'practice-123',
        backup_type: 'invalid_type', // Invalid enum value
        schedule_cron: '0 2 * * *',
        retention_days: 90,
        backup_location: 's3://backup-bucket/practice-123',
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = BackupSettingsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject backup settings with invalid retention period', () => {
      const invalidData = {
        practice_id: 'practice-123',
        backup_type: 'database',
        schedule_cron: '0 2 * * *',
        retention_days: 5, // Too short (minimum 7)
        backup_location: 's3://backup-bucket/practice-123',
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = BackupSettingsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdatePolicySchema', () => {
    it('should validate valid update policy', () => {
      const validData = {
        practice_id: 'practice-123',
        policy_name: 'Standard Update Policy',
        deployment_strategy: 'rolling',
        auto_approve_minor: false,
        auto_approve_patch: true,
        maintenance_windows: [
          {
            day_of_week: 0, // Sunday
            start_time: '02:00',
            end_time: '04:00',
            timezone: 'America/New_York',
          },
        ],
        rollback_conditions: {
          error_rate_threshold: 5,
          response_time_threshold: 2000,
          success_rate_threshold: 95,
          auto_rollback_enabled: true,
        },
        notification_settings: {
          notify_on_start: true,
          notify_on_success: true,
          notify_on_failure: true,
          notification_channels: ['email'],
        },
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = UpdatePolicySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject update policy with invalid deployment strategy', () => {
      const invalidData = {
        practice_id: 'practice-123',
        policy_name: 'Invalid Policy',
        deployment_strategy: 'instant', // Invalid enum value
        auto_approve_minor: false,
        auto_approve_patch: true,
        maintenance_windows: [],
        rollback_conditions: {},
        notification_settings: {},
        created_by: 'user-123',
        updated_by: 'user-123',
      };

      const result = UpdatePolicySchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateConfigurationRequestSchema', () => {
    it('should validate valid create request', () => {
      const validData = {
        type: 'practice_settings',
        data: {
          setting_key: 'test_setting',
          setting_value: { key: 'value' },
        },
        requires_approval: false,
      };

      const result = CreateConfigurationRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject create request with invalid type', () => {
      const invalidData = {
        type: 'invalid_type',
        data: {},
      };

      const result = CreateConfigurationRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateConfigurationRequestSchema', () => {
    it('should validate valid update request', () => {
      const validData = {
        data: { key: 'updated_value' },
        change_reason: 'Updating configuration for testing',
        requires_approval: true,
      };

      const result = UpdateConfigurationRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate update request without optional fields', () => {
      const validData = {
        data: { key: 'updated_value' },
      };

      const result = UpdateConfigurationRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});