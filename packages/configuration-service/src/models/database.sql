-- Configuration Management Database Schema
-- HIPAA Compliant with audit trails and encryption support

-- Create configuration schema
CREATE SCHEMA IF NOT EXISTS config;

-- Practice Configuration Table
CREATE TABLE config.practice_settings (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value JSONB NOT NULL,
    encrypted_fields TEXT[], -- Fields that require encryption
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(practice_id, setting_key, version)
);

-- Appointment Type Configuration
CREATE TABLE config.appointment_types (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    type_name VARCHAR(255) NOT NULL,
    type_code VARCHAR(50) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    scheduling_rules JSONB NOT NULL DEFAULT '{}',
    conflict_rules JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    UNIQUE(practice_id, type_code, version)
);

-- AI Conversation Configuration
CREATE TABLE config.ai_personality (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    personality_name VARCHAR(255) NOT NULL,
    personality_settings JSONB NOT NULL DEFAULT '{}',
    response_templates JSONB NOT NULL DEFAULT '{}',
    conversation_rules JSONB NOT NULL DEFAULT '{}',
    testing_parameters JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    UNIQUE(practice_id, personality_name, version)
);

-- Backup Configuration
CREATE TABLE config.backup_settings (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    backup_type VARCHAR(100) NOT NULL, -- 'database', 'files', 'logs', 'full'
    schedule_cron VARCHAR(100) NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 90,
    backup_location VARCHAR(500) NOT NULL,
    encryption_enabled BOOLEAN NOT NULL DEFAULT true,
    compression_enabled BOOLEAN NOT NULL DEFAULT true,
    notification_emails TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    UNIQUE(practice_id, backup_type, version)
);

-- Update Management Configuration
CREATE TABLE config.update_policies (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    policy_name VARCHAR(255) NOT NULL,
    deployment_strategy VARCHAR(100) NOT NULL, -- 'rolling', 'blue-green', 'canary'
    auto_approve_minor BOOLEAN NOT NULL DEFAULT false,
    auto_approve_patch BOOLEAN NOT NULL DEFAULT true,
    maintenance_windows JSONB NOT NULL DEFAULT '[]',
    rollback_conditions JSONB NOT NULL DEFAULT '{}',
    notification_settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    UNIQUE(practice_id, policy_name, version)
);

-- Configuration Change Audit Log
CREATE TABLE config.configuration_audit (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    record_id INTEGER NOT NULL,
    operation VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'
    old_values JSONB,
    new_values JSONB,
    change_reason TEXT,
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255)
);

-- Configuration Approval Workflow
CREATE TABLE config.configuration_approvals (
    id SERIAL PRIMARY KEY,
    practice_id VARCHAR(255) NOT NULL,
    configuration_table VARCHAR(255) NOT NULL,
    configuration_id INTEGER NOT NULL,
    requested_changes JSONB NOT NULL,
    approval_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create indexes for performance
CREATE INDEX idx_practice_settings_practice_id ON config.practice_settings(practice_id);
CREATE INDEX idx_practice_settings_key ON config.practice_settings(setting_key);
CREATE INDEX idx_practice_settings_active ON config.practice_settings(is_active);
CREATE INDEX idx_appointment_types_practice_id ON config.appointment_types(practice_id);
CREATE INDEX idx_appointment_types_active ON config.appointment_types(is_active);
CREATE INDEX idx_ai_personality_practice_id ON config.ai_personality(practice_id);
CREATE INDEX idx_backup_settings_practice_id ON config.backup_settings(practice_id);
CREATE INDEX idx_update_policies_practice_id ON config.update_policies(practice_id);
CREATE INDEX idx_config_audit_practice_id ON config.configuration_audit(practice_id);
CREATE INDEX idx_config_audit_table_record ON config.configuration_audit(table_name, record_id);
CREATE INDEX idx_config_audit_changed_at ON config.configuration_audit(changed_at);
CREATE INDEX idx_config_approvals_practice_id ON config.configuration_approvals(practice_id);
CREATE INDEX idx_config_approvals_status ON config.configuration_approvals(approval_status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION config.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all configuration tables
CREATE TRIGGER update_practice_settings_updated_at BEFORE UPDATE ON config.practice_settings FOR EACH ROW EXECUTE FUNCTION config.update_updated_at_column();
CREATE TRIGGER update_appointment_types_updated_at BEFORE UPDATE ON config.appointment_types FOR EACH ROW EXECUTE FUNCTION config.update_updated_at_column();
CREATE TRIGGER update_ai_personality_updated_at BEFORE UPDATE ON config.ai_personality FOR EACH ROW EXECUTE FUNCTION config.update_updated_at_column();
CREATE TRIGGER update_backup_settings_updated_at BEFORE UPDATE ON config.backup_settings FOR EACH ROW EXECUTE FUNCTION config.update_updated_at_column();
CREATE TRIGGER update_update_policies_updated_at BEFORE UPDATE ON config.update_policies FOR EACH ROW EXECUTE FUNCTION config.update_updated_at_column();

-- Grant permissions (adjust based on your role structure)
GRANT USAGE ON SCHEMA config TO app_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA config TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA config TO app_user;