/**
 * HIPAA-compliant structured audit log types and interfaces
 * Based on Story 4.1 specifications for comprehensive audit logging
 */

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  AUDIT = 'AUDIT'
}

export enum LogCategory {
  PATIENT_INTERACTION = 'PATIENT_INTERACTION',
  SYSTEM = 'SYSTEM',
  SECURITY = 'SECURITY',
  COMPLIANCE = 'COMPLIANCE'
}

export enum EventType {
  VERIFICATION = 'VERIFICATION',
  APPOINTMENT = 'APPOINTMENT',
  CONVERSATION = 'CONVERSATION',
  ACCESS = 'ACCESS',
  CONFIGURATION = 'CONFIGURATION',
  HEALTH_CHECK = 'HEALTH_CHECK',
  ERROR = 'ERROR'
}

export enum ActionType {
  VERIFY_PATIENT = 'VERIFY_PATIENT',
  SCHEDULE_APPOINTMENT = 'SCHEDULE_APPOINTMENT',
  MODIFY_APPOINTMENT = 'MODIFY_APPOINTMENT',
  CANCEL_APPOINTMENT = 'CANCEL_APPOINTMENT',
  RETRIEVE_INFO = 'RETRIEVE_INFO',
  ACCESS_PHI = 'ACCESS_PHI',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CONFIG_CHANGE = 'CONFIG_CHANGE'
}

export enum ActionStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PENDING = 'PENDING',
  TIMEOUT = 'TIMEOUT'
}

export enum VerificationMethod {
  DOB_NAME = 'DOB_NAME',
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
  MRN_VERIFICATION = 'MRN_VERIFICATION',
  SSN_PARTIAL = 'SSN_PARTIAL'
}

export enum InitiatorType {
  PATIENT = 'PATIENT',
  SYSTEM = 'SYSTEM',
  STAFF = 'STAFF'
}

export enum AuthorizationStatus {
  VALID = 'VALID',
  INVALID = 'INVALID',
  EMERGENCY_OVERRIDE = 'EMERGENCY_OVERRIDE'
}

export interface ActionDetails {
  verification_method?: VerificationMethod;
  appointment_type?: string;
  appointment_id?: string;
  provider_id?: string;
  error_code?: string;
  error_message?: string;
  phi_types_accessed?: string[];
  configuration_change?: {
    setting: string;
    old_value: string;
    new_value: string;
  };
}

export interface AuditMetadata {
  ip_address?: string;
  user_agent?: string;
  duration_ms?: number;
  correlation_id?: string;
  session_id?: string;
  request_id?: string;
  file_size?: number;
  response_code?: number;
}

export interface AuditTrail {
  initiator: InitiatorType;
  reason: string;
  authorization: AuthorizationStatus;
  staff_id?: string;
  patient_consent?: boolean;
}

export interface AuditLogEntry {
  // Required core fields
  timestamp: string; // ISO 8601 format
  log_level: LogLevel;
  category: LogCategory;
  event_type: EventType;
  service: string;

  // Action information
  action: {
    type: ActionType;
    status: ActionStatus;
    details: ActionDetails;
  };

  // Context identifiers (hashed for PHI protection)
  patient_id?: string; // Hashed MRN
  session_id?: string;

  // Metadata
  metadata: AuditMetadata;

  // PHI protection
  phi_accessed: boolean;

  // Audit trail
  audit_trail: AuditTrail;

  // Integrity protection
  integrity?: {
    hash: string; // SHA-256 hash of log content
    previous_hash?: string; // Chain of custody
    salt: string;
  };
}

export interface LogSearchParams {
  start_date?: string;
  end_date?: string;
  patient_id?: string;
  session_id?: string;
  category?: LogCategory;
  event_type?: EventType;
  action_status?: ActionStatus;
  phi_accessed?: boolean;
  service?: string;
  limit?: number;
  offset?: number;
}

export interface LogValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  generated_at: string;
  generated_by: string;
  date_range: {
    start: string;
    end: string;
  };
  filters: LogSearchParams;
  total_entries: number;
  entries: AuditLogEntry[];
  summary: {
    by_category: Record<LogCategory, number>;
    by_event_type: Record<EventType, number>;
    by_status: Record<ActionStatus, number>;
    phi_access_count: number;
    error_count: number;
  };
  signature?: string; // Digital signature for integrity
}

export interface RetentionPolicy {
  log_category: LogCategory;
  hot_storage_days: number;
  warm_storage_days: number;
  cold_storage_days: number;
  total_retention_days: number;
}