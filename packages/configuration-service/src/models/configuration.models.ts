import { z } from 'zod';

// Base configuration model
export const BaseConfigurationSchema = z.object({
  id: z.number().optional(),
  practice_id: z.string(),
  version: z.number().default(1),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  created_by: z.string(),
  updated_by: z.string(),
  is_active: z.boolean().default(true),
});

// Practice Settings Configuration
export const PracticeSettingsSchema = BaseConfigurationSchema.extend({
  setting_key: z.string(),
  setting_value: z.record(z.any()),
  encrypted_fields: z.array(z.string()).optional(),
});

export type PracticeSettings = z.infer<typeof PracticeSettingsSchema>;

// Practice Hours Configuration
export const PracticeHoursSchema = z.object({
  monday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  tuesday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  wednesday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  thursday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  friday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  saturday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  sunday: z.object({
    open: z.string(),
    close: z.string(),
    is_closed: z.boolean().default(false),
  }),
  timezone: z.string(),
  holidays: z.array(z.object({
    date: z.string(),
    name: z.string(),
    is_closed: z.boolean().default(true),
  })).optional(),
});

export type PracticeHours = z.infer<typeof PracticeHoursSchema>;

// Staff Schedule Configuration
export const StaffScheduleSchema = z.object({
  staff_id: z.string(),
  staff_name: z.string(),
  role: z.string(),
  weekly_schedule: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional(),
  }),
  time_off: z.array(z.object({
    start_date: z.string(),
    end_date: z.string(),
    reason: z.string(),
  })).optional(),
});

export type StaffSchedule = z.infer<typeof StaffScheduleSchema>;

// Appointment Type Configuration
export const AppointmentTypeSchema = BaseConfigurationSchema.extend({
  type_name: z.string(),
  type_code: z.string(),
  duration_minutes: z.number().min(5).max(480), // 5 minutes to 8 hours
  scheduling_rules: z.object({
    advance_booking_days: z.number().min(0).max(365),
    cancellation_hours: z.number().min(0).max(168),
    requires_confirmation: z.boolean().default(false),
    buffer_minutes_before: z.number().min(0).max(60).default(0),
    buffer_minutes_after: z.number().min(0).max(60).default(0),
    max_daily_bookings: z.number().min(1).max(100).optional(),
    allowed_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]), // 0=Sunday, 6=Saturday
  }),
  conflict_rules: z.object({
    cannot_overlap_with: z.array(z.string()).default([]),
    requires_gap_minutes: z.number().min(0).max(60).default(0),
    priority_level: z.number().min(1).max(10).default(5),
  }),
  description: z.string().optional(),
});

export type AppointmentType = z.infer<typeof AppointmentTypeSchema>;

// AI Personality Configuration
export const AIPersonalitySchema = BaseConfigurationSchema.extend({
  personality_name: z.string(),
  personality_settings: z.object({
    formality_level: z.enum(['casual', 'professional', 'formal']).default('professional'),
    empathy_level: z.enum(['low', 'medium', 'high']).default('high'),
    verbosity: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
    tone: z.enum(['friendly', 'neutral', 'compassionate']).default('compassionate'),
    cultural_adaptation: z.boolean().default(true),
    language_preference: z.string().default('en'),
  }),
  response_templates: z.object({
    greeting: z.string(),
    appointment_confirmation: z.string(),
    appointment_reminder: z.string(),
    cancellation_acknowledgment: z.string(),
    error_handling: z.string(),
    escalation_message: z.string(),
  }),
  conversation_rules: z.object({
    max_conversation_length: z.number().min(5).max(60).default(15), // minutes
    escalation_triggers: z.array(z.string()).default([]),
    prohibited_topics: z.array(z.string()).default([]),
    required_confirmations: z.array(z.string()).default(['appointment_booking', 'appointment_cancellation']),
  }),
  testing_parameters: z.object({
    test_scenarios: z.array(z.string()).default([]),
    success_metrics: z.object({
      conversation_completion_rate: z.number().min(0).max(100).default(90),
      patient_satisfaction_threshold: z.number().min(0).max(10).default(8),
      error_rate_threshold: z.number().min(0).max(10).default(2),
    }),
  }),
});

export type AIPersonality = z.infer<typeof AIPersonalitySchema>;

// Backup Configuration
export const BackupSettingsSchema = BaseConfigurationSchema.extend({
  backup_type: z.enum(['database', 'files', 'logs', 'full']),
  schedule_cron: z.string(),
  retention_days: z.number().min(7).max(2555).default(90), // 7 days to 7 years
  backup_location: z.string(),
  encryption_enabled: z.boolean().default(true),
  compression_enabled: z.boolean().default(true),
  notification_emails: z.array(z.string().email()).optional(),
});

export type BackupSettings = z.infer<typeof BackupSettingsSchema>;

// Update Policy Configuration
export const UpdatePolicySchema = BaseConfigurationSchema.extend({
  policy_name: z.string(),
  deployment_strategy: z.enum(['rolling', 'blue-green', 'canary']),
  auto_approve_minor: z.boolean().default(false),
  auto_approve_patch: z.boolean().default(true),
  maintenance_windows: z.array(z.object({
    day_of_week: z.number().min(0).max(6),
    start_time: z.string(),
    end_time: z.string(),
    timezone: z.string(),
  })).default([]),
  rollback_conditions: z.object({
    error_rate_threshold: z.number().min(0).max(100).default(5),
    response_time_threshold: z.number().min(100).max(10000).default(2000),
    success_rate_threshold: z.number().min(0).max(100).default(95),
    auto_rollback_enabled: z.boolean().default(true),
  }),
  notification_settings: z.object({
    notify_on_start: z.boolean().default(true),
    notify_on_success: z.boolean().default(true),
    notify_on_failure: z.boolean().default(true),
    notification_channels: z.array(z.enum(['email', 'slack', 'sms'])).default(['email']),
  }),
});

export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;

// Configuration Audit Log
export const ConfigurationAuditSchema = z.object({
  id: z.number().optional(),
  practice_id: z.string(),
  table_name: z.string(),
  record_id: z.number(),
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT']),
  old_values: z.record(z.any()).optional(),
  new_values: z.record(z.any()).optional(),
  change_reason: z.string().optional(),
  changed_by: z.string(),
  changed_at: z.date().optional(),
  approved_by: z.string().optional(),
  approved_at: z.date().optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  session_id: z.string().optional(),
});

export type ConfigurationAudit = z.infer<typeof ConfigurationAuditSchema>;

// Configuration Approval Workflow
export const ConfigurationApprovalSchema = z.object({
  id: z.number().optional(),
  practice_id: z.string(),
  configuration_table: z.string(),
  configuration_id: z.number(),
  requested_changes: z.record(z.any()),
  approval_status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  requested_by: z.string(),
  requested_at: z.date().optional(),
  reviewed_by: z.string().optional(),
  reviewed_at: z.date().optional(),
  review_comments: z.string().optional(),
  expires_at: z.date().optional(),
});

export type ConfigurationApproval = z.infer<typeof ConfigurationApprovalSchema>;

// API Request/Response Types
export const CreateConfigurationRequestSchema = z.object({
  type: z.enum([
    'practice_settings',
    'appointment_type',
    'ai_personality',
    'backup_settings',
    'update_policy',
    'disaster_recovery_plan',
    'recovery_test_result',
    'backup_test_suite',
    'backup_test_execution',
    'backup_monitoring_config',
    'backup_health_metrics',
    'backup_performance_report',
    'backup_alert',
    'update_pipeline',
    'pipeline_execution',
    'staging_environment'
  ]),
  data: z.record(z.any()),
  requires_approval: z.boolean().default(false),
});

export type CreateConfigurationRequest = z.infer<typeof CreateConfigurationRequestSchema>;

export const UpdateConfigurationRequestSchema = z.object({
  data: z.record(z.any()),
  change_reason: z.string().optional(),
  requires_approval: z.boolean().default(false),
});

export type UpdateConfigurationRequest = z.infer<typeof UpdateConfigurationRequestSchema>;

export const ConfigurationResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.any()).optional(),
  message: z.string().optional(),
  errors: z.array(z.string()).optional(),
  approval_required: z.boolean().optional(),
  approval_id: z.number().optional(),
});

export type ConfigurationResponse = z.infer<typeof ConfigurationResponseSchema>;