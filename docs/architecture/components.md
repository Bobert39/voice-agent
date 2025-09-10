# Components

## Voice Processing Service

**Responsibility:** Handles all voice AI interactions including speech recognition, natural language understanding, and voice synthesis for patient conversations.

**Key Interfaces:**
- `POST /voice/process` - Process incoming voice calls from Twilio
- `POST /voice/synthesize` - Generate AI voice responses
- `GET /voice/session/{sessionId}` - Retrieve conversation state
- `POST /voice/escalate` - Transfer call to human staff

**Dependencies:** Patient Verification Service (identity confirmation), Appointment Scheduling Service (booking requests), Audit Service (conversation logging)

**Technology Stack:** 
- AWS Lambda with Node.js 20.x runtime
- OpenAI Whisper API for speech-to-text
- GPT-4 for natural language processing
- ElevenLabs for text-to-speech synthesis
- Twilio SDK for telephony integration
- Redis for conversation session management

## Patient Verification Service

**Responsibility:** Securely authenticates patient identity using name, date of birth, and phone number before allowing access to scheduling or medical information.

**Key Interfaces:**
- `POST /verify/patient` - Initiate patient verification process
- `POST /verify/validate` - Validate patient credentials
- `GET /verify/session/{sessionId}` - Check verification status
- `POST /verify/reset` - Reset failed verification attempts

**Dependencies:** OpenEMR integration for patient lookup, Audit Service for security logging

**Technology Stack:**
- AWS Lambda with enhanced security configuration
- PostgreSQL with encrypted patient data
- AWS KMS for field-level encryption
- Custom OpenEMR OAuth2 client
- Rate limiting middleware for brute force prevention

## Appointment Scheduling Service

**Responsibility:** Manages appointment booking, rescheduling, and cancellation with real-time OpenEMR synchronization and conflict prevention.

**Key Interfaces:**
- `GET /appointments/availability` - Check available time slots
- `POST /appointments/book` - Create new appointment
- `PUT /appointments/{id}/reschedule` - Modify existing appointment
- `DELETE /appointments/{id}/cancel` - Cancel appointment
- `GET /appointments/patient/{patientId}` - Patient appointment history

**Dependencies:** OpenEMR API for calendar access, Patient Verification Service for authorization, Audit Service for change tracking

**Technology Stack:**
- AWS Lambda with provisioned concurrency
- PostgreSQL for appointment data
- FHIR R4 client libraries for OpenEMR integration
- Custom appointment conflict detection algorithms
- SQS for async OpenEMR synchronization

## Audit Logging Service

**Responsibility:** Comprehensive HIPAA-compliant logging of all patient interactions, system activities, and security events with tamper-proof storage.

**Key Interfaces:**
- `POST /audit/log` - Record system events
- `POST /audit/patient-interaction` - Log patient conversations
- `GET /audit/search` - Query audit logs for compliance
- `GET /audit/report/{type}` - Generate compliance reports

**Dependencies:** All other services send audit events, AWS CloudTrail for infrastructure events

**Technology Stack:**
- AWS Lambda for log processing
- PostgreSQL with write-only audit tables
- AWS CloudWatch for real-time monitoring
- SNS for audit event distribution
- Custom digital signature implementation for log integrity

## Staff Notification Service

**Responsibility:** Handles escalation notifications, staff alerts, and communication between the AI system and practice staff members.

**Key Interfaces:**
- `POST /notifications/escalate` - Send escalation alerts
- `POST /notifications/appointment-change` - Notify of schedule changes
- `GET /notifications/staff/{staffId}` - Retrieve staff notifications
- `POST /notifications/acknowledge` - Mark notifications as handled

**Dependencies:** Staff Member data, Voice Processing Service escalations, Appointment Scheduling changes

**Technology Stack:**
- AWS Lambda with SNS integration
- Email notifications via AWS SES
- SMS alerts via Twilio
- Real-time dashboard updates via WebSocket
- PostgreSQL for notification tracking

## Admin Dashboard Service

**Responsibility:** Provides web-based interface for staff to monitor AI system activity, handle escalations, and manage practice configuration.

**Key Interfaces:**
- `GET /dashboard/status` - System health overview
- `GET /dashboard/calls/active` - Real-time call monitoring
- `GET /dashboard/appointments/recent` - Recent booking activity
- `PUT /dashboard/config/practice` - Update practice settings

**Dependencies:** All services for monitoring data, Staff authentication for access control

**Technology Stack:**
- Express.js web server
- React frontend with TypeScript
- WebSocket for real-time updates
- JWT authentication for staff access
- Redis for session management

## OpenEMR Integration Service

**Responsibility:** Dedicated service for managing all OpenEMR API communications, authentication, and data synchronization patterns.

**Key Interfaces:**
- `POST /openemr/auth` - Handle OAuth2 authentication flow
- `GET /openemr/patients/{id}` - Retrieve patient information
- `POST /openemr/appointments` - Create appointments in OpenEMR
- `GET /openemr/availability` - Query appointment availability

**Dependencies:** OpenEMR external system, internal services requiring EMR data

**Technology Stack:**
- AWS Lambda with extended timeout configuration
- Custom OAuth2 client for OpenEMR 7.0.3
- FHIR R4 client libraries
- Circuit breaker pattern for resilience
- Retry logic with exponential backoff
