# Data Models

## Patient Model

**Purpose:** Represents patient identity and verification information for secure voice interactions

**Key Attributes:**
- `id`: UUID - Internal system identifier
- `openemr_patient_id`: string - OpenEMR patient reference ID
- `phone_number`: string (encrypted) - Primary contact for voice calls
- `date_of_birth`: Date (encrypted) - Verification credential
- `full_name`: string (encrypted) - Patient identification
- `verification_attempts`: number - Failed verification tracking
- `last_verified_at`: DateTime - Security audit trail
- `active_session_token`: string - Current conversation session
- `preferred_language`: string - Voice interaction preference

**Relationships:**
- One-to-many with VoiceInteraction (conversation history)
- One-to-many with AppointmentRequest (scheduling attempts)

**Security Notes:** All PII fields encrypted at rest using AWS KMS

## Appointment Model

**Purpose:** Manages appointment scheduling with OpenEMR synchronization and voice workflow tracking

**Key Attributes:**
- `id`: UUID - Internal appointment identifier
- `openemr_appointment_id`: string - OpenEMR reference ID
- `patient_id`: UUID - Foreign key to Patient model
- `appointment_datetime`: DateTime - Scheduled time
- `appointment_type`: enum - (routine_exam, follow_up, urgent, consultation)
- `duration_minutes`: number - Appointment length
- `status`: enum - (requested, confirmed, cancelled, completed, no_show)
- `voice_booking_session`: UUID - Link to booking conversation
- `confirmation_number`: string - Patient reference number
- `openemr_sync_status`: enum - (pending, synced, failed, conflict)
- `created_via`: enum - (voice_agent, staff, patient_portal, walk_in)
- `special_instructions`: string - Patient preparation notes

**Relationships:**
- Many-to-one with Patient (appointment owner)
- One-to-one with VoiceInteraction (booking conversation)
- One-to-many with AppointmentChange (modification history)

**Business Rules:**
- Appointment slots must align with practice availability
- Minimum 24-hour advance booking for routine exams
- Maximum 60-day advance booking window

## VoiceInteraction Model

**Purpose:** Comprehensive audit trail of all patient voice conversations for HIPAA compliance

**Key Attributes:**
- `id`: UUID - Interaction identifier
- `patient_id`: UUID - Verified patient (null for failed verification)
- `phone_number`: string (encrypted) - Caller identification
- `session_start`: DateTime - Call initiation timestamp
- `session_end`: DateTime - Call completion timestamp
- `conversation_transcript`: text (encrypted) - Full conversation log
- `intent_recognized`: enum - (schedule, reschedule, cancel, inquiry, escalation)
- `verification_successful`: boolean - Patient identity confirmed
- `action_completed`: boolean - Request fulfilled successfully
- `escalated_to_staff`: boolean - Human handoff occurred
- `staff_member_id`: UUID - Staff who handled escalation
- `audio_file_reference`: string - Encrypted audio storage location
- `ai_confidence_scores`: jsonb - NLP accuracy metrics

**Relationships:**
- Many-to-one with Patient (identified caller)
- One-to-one with Appointment (if scheduling occurred)
- One-to-many with ConversationTurn (detailed exchange log)

**Compliance Notes:** Encrypted storage with 7-year retention per HIPAA requirements

## Practice Configuration Model

**Purpose:** Stores practice-specific information for voice responses and scheduling rules

**Key Attributes:**
- `id`: UUID - Configuration identifier
- `practice_name`: string - "Capitol Eye Care"
- `phone_number`: string - Main practice number
- `address`: jsonb - Full practice location details
- `business_hours`: jsonb - Weekly schedule with exceptions
- `insurance_plans_accepted`: string[] - List of accepted insurance
- `appointment_types`: jsonb - Available appointment configurations
- `holiday_schedule`: jsonb - Closure dates and special hours
- `voice_agent_greeting`: text - Customizable AI introduction
- `escalation_triggers`: jsonb - Rules for human handoff
- `openemr_api_config`: jsonb (encrypted) - Integration settings

**Relationships:**
- Referenced by all voice interactions for contextual responses
- Used by scheduling service for business rule enforcement

## Staff Member Model

**Purpose:** Manages staff access to the AI system dashboard and escalation handling

**Key Attributes:**
- `id`: UUID - Staff identifier
- `employee_id`: string - Practice employee number
- `full_name`: string - Staff member name
- `role`: enum - (doctor, nurse, receptionist, admin, manager)
- `phone_extension`: string - Internal contact
- `email`: string - Notification email
- `dashboard_permissions`: string[] - System access rights
- `escalation_availability`: jsonb - When available for handoffs
- `openemr_user_id`: string - OpenEMR system reference
- `last_login`: DateTime - Security audit
- `active`: boolean - Employment status

**Relationships:**
- One-to-many with VoiceInteraction (escalation handling)
- One-to-many with SystemAuditLog (action tracking)

**Security Notes:** Role-based access control for HIPAA compliance
