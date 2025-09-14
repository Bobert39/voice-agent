/**
 * Type definitions for Patient Verification Service
 */

export interface PatientIdentity {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD format
  phoneNumber?: string;
}

export interface VerificationSession {
  sessionId: string;
  patientId?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  phone?: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastAttemptAt?: Date;
  escalationTriggered: boolean;
}

export interface VerificationAttempt {
  sessionId: string;
  timestamp: Date;
  success: boolean;
  providedData: {
    firstName?: string;
    lastName?: string;
    dob?: string;
    phone?: string;
  };
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerificationResult {
  success: boolean;
  sessionId: string;
  patientId?: string;
  attempts: number;
  maxAttempts: number;
  escalationRequired: boolean;
  verificationToken?: string;
  message: string;
  nextSteps?: string[];
}

export interface ConversationFlow {
  prompt: string;
  expectedInfo: string;
  nextStep: string;
}

export type ConversationStep = 'start' | 'first_name' | 'last_name' | 'dob' | 'phone';

export interface EscalationTrigger {
  sessionId: string;
  reason: 'max_attempts_exceeded' | 'service_error' | 'manual_request';
  timestamp: Date;
  attemptCount: number;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    conversationId?: string;
  };
}

export interface AuditEntry {
  id: string;
  sessionId: string;
  event: 'session_created' | 'verification_attempt' | 'verification_success' | 'verification_failure' | 'escalation_triggered';
  timestamp: Date;
  data: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    redis: boolean;
    openemr: boolean;
    database?: boolean;
  };
  timestamp: Date;
  uptime?: number;
}

export interface ServiceConfiguration {
  openemr: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
  verification: {
    maxAttempts: number;
    sessionTimeoutMinutes: number;
    requirePhone: boolean;
  };
  security: {
    encryptionKey: string;
    jwtSecret: string;
  };
  redis: {
    url: string;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Error Types
export interface VerificationError extends Error {
  code: 'SESSION_NOT_FOUND' | 'OPENEMR_CONNECTION_ERROR' | 'REDIS_CONNECTION_ERROR' | 
        'INVALID_CREDENTIALS' | 'MAX_ATTEMPTS_EXCEEDED' | 'SESSION_EXPIRED' | 
        'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'RATE_LIMITED';
  sessionId?: string;
  details?: any;
}

// OpenEMR Types
export interface OpenEMRPatient {
  pid: string;
  fname: string;
  lname: string;
  DOB: string;
  phone_home?: string;
  phone_cell?: string;
  email?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
  };
}

export interface OpenEMRTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

// Conversation Context
export interface ConversationContext {
  sessionId: string;
  conversationId?: string;
  currentStep: ConversationStep;
  collectedData: Partial<PatientIdentity>;
  attemptCount: number;
  lastPrompt?: string;
  lastResponse?: string;
  metadata?: {
    voiceCall?: boolean;
    language?: string;
    assistiveMode?: boolean;
  };
}