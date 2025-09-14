-- Practice Information Database Schema
-- Migration 002: Create tables for practice information management
-- Story 2.3: Practice Information Response System

-- Enable UUID and crypto extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Practice configuration table - core practice details
CREATE TABLE practice_configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_name VARCHAR(255) NOT NULL,
    practice_timezone VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    phone_number VARCHAR(20) NOT NULL,
    website_url VARCHAR(500),
    email VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Practice locations table
CREATE TABLE practice_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    location_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'United States',
    
    -- Contact information
    phone_number VARCHAR(20),
    fax_number VARCHAR(20),
    
    -- Accessibility and parking information
    parking_instructions TEXT,
    parking_cost VARCHAR(100),
    accessibility_features JSONB DEFAULT '[]',
    public_transportation TEXT,
    directions TEXT,
    
    -- Location metadata
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business hours table - flexible schedule management
CREATE TABLE business_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    location_id UUID REFERENCES practice_locations(id) ON DELETE CASCADE,
    
    -- Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    
    -- Time slots (stored as TIME for easy comparison)
    open_time TIME,
    close_time TIME,
    
    -- Break times (for lunch breaks, etc.)
    break_start TIME,
    break_end TIME,
    
    -- Schedule metadata
    schedule_type VARCHAR(50) DEFAULT 'regular' CHECK (schedule_type IN ('regular', 'holiday', 'seasonal')),
    effective_start_date DATE,
    effective_end_date DATE,
    
    -- Special notes
    notes TEXT,
    
    is_closed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no overlapping schedules for same day/location
    UNIQUE(practice_id, location_id, day_of_week, schedule_type, effective_start_date)
);

-- Holiday schedules table
CREATE TABLE holiday_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    location_id UUID REFERENCES practice_locations(id) ON DELETE CASCADE,
    
    holiday_name VARCHAR(255) NOT NULL,
    holiday_date DATE NOT NULL,
    
    -- Holiday hours (null if closed)
    open_time TIME,
    close_time TIME,
    
    -- Recurring holiday information
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_type VARCHAR(50) CHECK (recurring_type IN ('annual', 'monthly', 'weekly')),
    
    -- Advance notice settings
    advance_notice_days INTEGER DEFAULT 7,
    notice_message TEXT,
    
    is_closed BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insurance plans and acceptance
CREATE TABLE insurance_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    
    insurance_company VARCHAR(255) NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(100), -- 'vision', 'medical', 'both'
    
    -- Acceptance details
    is_accepted BOOLEAN DEFAULT TRUE,
    requires_referral BOOLEAN DEFAULT FALSE,
    requires_preauthorization BOOLEAN DEFAULT FALSE,
    copay_amount DECIMAL(10,2),
    
    -- Verification requirements
    verification_requirements JSONB DEFAULT '[]',
    notes TEXT,
    
    -- Effective dates
    effective_start_date DATE DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(practice_id, insurance_company, plan_name)
);

-- Appointment types and preparation instructions
CREATE TABLE appointment_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    
    appointment_type_name VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    description TEXT,
    
    -- Preparation requirements
    requires_dilation BOOLEAN DEFAULT FALSE,
    requires_driver BOOLEAN DEFAULT FALSE,
    fasting_required BOOLEAN DEFAULT FALSE,
    
    -- What to bring
    bring_requirements JSONB DEFAULT '[]', -- Array of items to bring
    
    -- Special instructions
    preparation_instructions TEXT,
    post_appointment_care TEXT,
    
    -- Scheduling constraints
    buffer_time_minutes INTEGER DEFAULT 0,
    max_daily_appointments INTEGER,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(practice_id, appointment_type_name)
);

-- Practice policies and procedures
CREATE TABLE practice_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    
    policy_category VARCHAR(100) NOT NULL, -- 'cancellation', 'payment', 'arrival', 'privacy', etc.
    policy_name VARCHAR(255) NOT NULL,
    policy_content TEXT NOT NULL,
    
    -- Policy metadata
    severity_level VARCHAR(50) DEFAULT 'standard' CHECK (severity_level IN ('info', 'standard', 'important', 'critical')),
    applies_to_appointment_types JSONB DEFAULT '[]', -- Array of appointment type IDs
    
    -- Display settings for voice responses
    include_in_voice_response BOOLEAN DEFAULT TRUE,
    voice_summary TEXT, -- Condensed version for voice responses
    
    effective_start_date DATE DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(practice_id, policy_category, policy_name)
);

-- FAQ and common responses for practice information
CREATE TABLE practice_faqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    
    question_category VARCHAR(100) NOT NULL, -- 'hours', 'location', 'insurance', 'preparation', 'policies'
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    
    -- Voice-specific formatting
    voice_response_text TEXT, -- Elderly-friendly version
    confirmation_prompt TEXT, -- "Would you like me to repeat that?"
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Search and matching
    keywords JSONB DEFAULT '[]', -- Array of keywords for matching
    intent_categories JSONB DEFAULT '[]', -- NLU intent categories
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seasonal adjustments and special schedules
CREATE TABLE seasonal_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    location_id UUID REFERENCES practice_locations(id) ON DELETE CASCADE,
    
    season_name VARCHAR(100) NOT NULL, -- 'Summer Hours', 'Holiday Season', 'School Year'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Modified hours for each day
    monday_open TIME,
    monday_close TIME,
    tuesday_open TIME,
    tuesday_close TIME,
    wednesday_open TIME,
    wednesday_close TIME,
    thursday_open TIME,
    thursday_close TIME,
    friday_open TIME,
    friday_close TIME,
    saturday_open TIME,
    saturday_close TIME,
    sunday_open TIME,
    sunday_close TIME,
    
    -- Override settings
    overrides_regular_hours BOOLEAN DEFAULT TRUE,
    advance_notice_message TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Practice information change log for audit trail
CREATE TABLE practice_info_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    practice_id UUID NOT NULL REFERENCES practice_configuration(id) ON DELETE CASCADE,
    
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('INSERT', 'UPDATE', 'DELETE')),
    
    old_values JSONB,
    new_values JSONB,
    changed_fields JSONB, -- Array of field names that changed
    
    changed_by VARCHAR(255), -- User ID or system identifier
    change_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_practice_locations_practice_id ON practice_locations(practice_id);
CREATE INDEX idx_practice_locations_is_primary ON practice_locations(practice_id, is_primary);

CREATE INDEX idx_business_hours_practice_location ON business_hours(practice_id, location_id);
CREATE INDEX idx_business_hours_day_type ON business_hours(day_of_week, schedule_type);
CREATE INDEX idx_business_hours_effective_dates ON business_hours(effective_start_date, effective_end_date);

CREATE INDEX idx_holiday_schedules_practice_location ON holiday_schedules(practice_id, location_id);
CREATE INDEX idx_holiday_schedules_date ON holiday_schedules(holiday_date);
CREATE INDEX idx_holiday_schedules_recurring ON holiday_schedules(is_recurring, recurring_type);

CREATE INDEX idx_insurance_plans_practice ON insurance_plans(practice_id);
CREATE INDEX idx_insurance_plans_company ON insurance_plans(practice_id, insurance_company);
CREATE INDEX idx_insurance_plans_accepted ON insurance_plans(practice_id, is_accepted, is_active);

CREATE INDEX idx_appointment_types_practice ON appointment_types(practice_id);
CREATE INDEX idx_appointment_types_active ON appointment_types(practice_id, is_active);

CREATE INDEX idx_practice_policies_practice_category ON practice_policies(practice_id, policy_category);
CREATE INDEX idx_practice_policies_voice ON practice_policies(practice_id, include_in_voice_response);

CREATE INDEX idx_practice_faqs_category ON practice_faqs(practice_id, question_category);
CREATE INDEX idx_practice_faqs_active ON practice_faqs(practice_id, is_active);
CREATE INDEX idx_practice_faqs_keywords ON practice_faqs USING GIN (keywords);

CREATE INDEX idx_seasonal_schedules_dates ON seasonal_schedules(practice_id, start_date, end_date);

CREATE INDEX idx_practice_info_changes_table_record ON practice_info_changes(table_name, record_id);
CREATE INDEX idx_practice_info_changes_created_at ON practice_info_changes(created_at);

-- Insert initial practice configuration for Capitol Eye Care
INSERT INTO practice_configuration (
    practice_name,
    practice_timezone,
    phone_number,
    description
) VALUES (
    'Capitol Eye Care',
    'America/New_York',
    '(555) 123-4567',
    'Comprehensive eye care and vision services for all ages'
);

-- Get the practice ID for subsequent inserts
WITH practice_info AS (
    SELECT id as practice_id FROM practice_configuration WHERE practice_name = 'Capitol Eye Care'
)

-- Insert primary location
INSERT INTO practice_locations (
    practice_id,
    location_name,
    address_line1,
    city,
    state,
    zip_code,
    phone_number,
    parking_instructions,
    accessibility_features,
    is_primary
)
SELECT 
    practice_id,
    'Main Office',
    '123 Vision Way',
    'Capitol City',
    'NY',
    '12345',
    '(555) 123-4567',
    'Free parking available in the lot behind our building. Handicapped accessible spaces are available near the main entrance.',
    '["wheelchair_accessible", "accessible_parking", "hearing_loop", "large_print_available"]',
    true
FROM practice_info;

-- Insert regular business hours
WITH practice_info AS (
    SELECT id as practice_id FROM practice_configuration WHERE practice_name = 'Capitol Eye Care'
)
INSERT INTO business_hours (practice_id, day_of_week, open_time, close_time, schedule_type)
SELECT practice_id, day_of_week, open_time, close_time, 'regular'
FROM practice_info
CROSS JOIN (VALUES
    (1, '08:00'::TIME, '17:00'::TIME), -- Monday
    (2, '08:00'::TIME, '18:00'::TIME), -- Tuesday  
    (3, '08:00'::TIME, '17:00'::TIME), -- Wednesday
    (4, '08:00'::TIME, '18:00'::TIME), -- Thursday
    (5, '08:00'::TIME, '16:00'::TIME), -- Friday
    (6, '09:00'::TIME, '14:00'::TIME)  -- Saturday
) AS hours(day_of_week, open_time, close_time);

-- Sunday is closed (no entry = closed)

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO voice_agent;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO voice_agent;

-- Add audit triggers for change tracking
CREATE OR REPLACE FUNCTION log_practice_info_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO practice_info_changes (
            practice_id, table_name, record_id, change_type, old_values, changed_by
        ) VALUES (
            COALESCE(OLD.practice_id, 
                CASE TG_TABLE_NAME 
                    WHEN 'practice_configuration' THEN OLD.id 
                    ELSE NULL 
                END
            ),
            TG_TABLE_NAME,
            OLD.id,
            'DELETE',
            to_jsonb(OLD),
            current_setting('application_name', true)
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO practice_info_changes (
            practice_id, table_name, record_id, change_type, old_values, new_values, changed_by
        ) VALUES (
            COALESCE(NEW.practice_id, 
                CASE TG_TABLE_NAME 
                    WHEN 'practice_configuration' THEN NEW.id 
                    ELSE NULL 
                END
            ),
            TG_TABLE_NAME,
            NEW.id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            current_setting('application_name', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO practice_info_changes (
            practice_id, table_name, record_id, change_type, new_values, changed_by
        ) VALUES (
            COALESCE(NEW.practice_id, 
                CASE TG_TABLE_NAME 
                    WHEN 'practice_configuration' THEN NEW.id 
                    ELSE NULL 
                END
            ),
            TG_TABLE_NAME,
            NEW.id,
            'INSERT',
            to_jsonb(NEW),
            current_setting('application_name', true)
        );
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for all practice information tables
CREATE TRIGGER audit_practice_configuration 
    AFTER INSERT OR UPDATE OR DELETE ON practice_configuration
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_practice_locations 
    AFTER INSERT OR UPDATE OR DELETE ON practice_locations
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_business_hours 
    AFTER INSERT OR UPDATE OR DELETE ON business_hours
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_holiday_schedules 
    AFTER INSERT OR UPDATE OR DELETE ON holiday_schedules
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_insurance_plans 
    AFTER INSERT OR UPDATE OR DELETE ON insurance_plans
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_appointment_types 
    AFTER INSERT OR UPDATE OR DELETE ON appointment_types
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_practice_policies 
    AFTER INSERT OR UPDATE OR DELETE ON practice_policies
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();

CREATE TRIGGER audit_practice_faqs 
    AFTER INSERT OR UPDATE OR DELETE ON practice_faqs
    FOR EACH ROW EXECUTE FUNCTION log_practice_info_changes();