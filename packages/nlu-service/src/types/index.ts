/**
 * NLU Service Types and Interfaces
 * HIPAA Compliant - No PHI in raw utterances
 */

// Intent Categories for Healthcare Domain
export enum IntentCategory {
  APPOINTMENT = 'appointment',
  PRACTICE_INFO = 'practice_info',
  INSURANCE = 'insurance',
  PRESCRIPTION = 'prescription',
  EMERGENCY = 'emergency',
  GENERAL = 'general',
  UNKNOWN = 'unknown'
}

// Entity Types for Healthcare Domain
export enum EntityType {
  DATE = 'date',
  TIME = 'time',
  DURATION = 'duration',
  PROVIDER = 'provider',
  CONDITION = 'condition',
  MEDICATION = 'medication',
  INSURANCE_CARRIER = 'insurance_carrier',
  LOCATION = 'location',
  PHONE_NUMBER = 'phone_number',
  EMAIL = 'email'
}

// Confidence Levels for Escalation
export enum ConfidenceLevel {
  HIGH = 'high',        // > 0.8
  MEDIUM = 'medium',    // 0.6 - 0.8
  LOW = 'low'          // < 0.6
}

// Intent Recognition Result
export interface IntentResult {
  category: IntentCategory;
  intent: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  requiresEscalation: boolean;
  suggestedAction?: string;
}

// Entity Extraction Result
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  normalizedValue?: string;
  confidence: number;
  startPosition?: number;
  endPosition?: number;
}

// NLU Processing Result
export interface NLUResult {
  sessionId: string;
  utterance: string; // Sanitized - no PHI
  intent: IntentResult;
  entities: ExtractedEntity[];
  context?: ConversationContext;
  fallbackResponse?: string;
  processingTime: number;
  timestamp: string;
}

// Conversation Context Management
export interface ConversationContext {
  sessionId: string;
  patientVerified: boolean;
  patientId?: string; // Only if verified
  conversationHistory: ConversationTurn[];
  currentTopic?: string;
  lastIntent?: IntentCategory;
  contextTimeout: number;
}

export interface ConversationTurn {
  timestamp: string;
  intent: IntentCategory;
  entities: ExtractedEntity[];
  response?: string;
}


// Fallback Response Configuration
export interface FallbackConfig {
  category: IntentCategory;
  triggers: string[];
  response: string;
  suggestions: string[];
  escalationOption: boolean;
}

// Intent Training Data
export interface IntentTrainingData {
  category: IntentCategory;
  examples: string[];
  entities: EntityType[];
  confidenceThreshold: number;
}

// Service Configuration
export interface NLUServiceConfig {
  openaiApiKey: string;
  openaiModel: string;
  redisUrl: string;
  maxRetries: number;
  timeout: number;
  confidenceThresholds: {
    high: number;
    medium: number;
    low: number;
  };
  contextTimeout: number; // in seconds
  maxConversationHistory: number;
}

// API Request/Response Types
export interface NLURequest {
  sessionId: string;
  utterance: string;
  patientVerified?: boolean;
  patientId?: string;
  contextEnabled?: boolean;
}

export interface NLUResponse {
  success: boolean;
  result?: NLUResult;
  error?: string;
  escalationRequired?: boolean;
  suggestedResponse?: string;
}

// Error Types
export class NLUError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'NLUError';
  }
}

// Audit Log Entry for HIPAA Compliance
export interface NLUAuditLog {
  timestamp: string;
  sessionId: string;
  patientId?: string; // Only if verified
  intentCategory: IntentCategory;
  confidence: number;
  escalated: boolean;
  processingTime: number;
  success: boolean;
  errorCode?: string;
}