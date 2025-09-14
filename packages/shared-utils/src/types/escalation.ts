// Escalation types for human handoff system

export enum EscalationPriority {
  CRITICAL = 'critical',    // <2 min response time
  HIGH = 'high',           // <5 min response time
  NORMAL = 'normal',       // <15 min response time
  LOW = 'low'              // Best effort
}

export enum EscalationTrigger {
  // Emotional triggers
  EMOTIONAL_DISTRESS = 'emotional_distress',
  FRUSTRATION = 'frustration',
  ANGER = 'anger',
  
  // Request triggers
  EXPLICIT_REQUEST = 'explicit_request',
  COMPLEX_MEDICAL_QUERY = 'complex_medical_query',
  BILLING_ISSUE = 'billing_issue',
  COMPLAINT = 'complaint',
  
  // System triggers
  AI_SERVICE_FAILURE = 'ai_service_failure',
  REPEATED_MISUNDERSTANDING = 'repeated_misunderstanding',
  VERIFICATION_FAILURE = 'verification_failure',
  TIMEOUT = 'timeout'
}

export enum EscalationStatus {
  TRIGGERED = 'triggered',
  NOTIFIED = 'notified',
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  ABANDONED = 'abandoned'
}

export interface EscalationTurn {
  timestamp: Date;
  speaker: 'patient' | 'ai';
  text: string;
  intent?: string;
  sentiment?: number; // -1 to 1
  emotionalMarkers?: string[];
}

export interface EscalationEmotionalState {
  overall: 'positive' | 'neutral' | 'negative' | 'distressed';
  confidence: number;
  markers: string[];
  lastUpdated: Date;
}

export interface EscalationContext {
  conversationId: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  
  // Conversation history
  transcript: EscalationTurn[];
  currentIntent?: string;
  previousIntents: string[];
  
  // Timing
  callStartTime: Date;
  escalationTime: Date;
  totalDuration: number;
  
  // Additional context
  emotionalState?: EscalationEmotionalState;
  verificationAttempts?: number;
  misunderstandingCount?: number;
}


export interface EscalationEvent {
  id: string;
  conversationId: string;
  trigger: EscalationTrigger;
  priority: EscalationPriority;
  status: EscalationStatus;
  context: EscalationContext;
  
  // Timing
  triggeredAt: Date;
  notifiedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  
  // Outcome
  resolution?: string;
  notes?: string;
  followUpRequired?: boolean;
}

export interface StaffNotification {
  escalationId: string;
  priority: EscalationPriority;
  department: 'reception' | 'medical' | 'billing' | 'technical';
  message: string;
  quickActions: QuickAction[];
  context: EscalationContext;
}

export interface QuickAction {
  id: string;
  label: string;
  action: 'acknowledge' | 'transfer' | 'resolve' | 'notes';
  data?: any;
}

export interface EscalationMetrics {
  totalEscalations: number;
  byTrigger: Record<EscalationTrigger, number>;
  byPriority: Record<EscalationPriority, number>;
  averageResponseTime: number;
  averageResolutionTime: number;
  abandonmentRate: number;
  periodStart: Date;
  periodEnd: Date;
}

// Configuration for escalation rules
export interface EscalationConfig {
  // Emotional detection thresholds
  emotionalDistressThreshold: number;
  frustrationThreshold: number;
  
  // Timing thresholds
  misunderstandingLimit: number;
  verificationAttemptLimit: number;
  conversationTimeoutMinutes: number;
  
  // Keywords that trigger escalation
  escalationKeywords: string[];
  medicalComplexityKeywords: string[];
  
  // Priority rules
  priorityRules: PriorityRule[];
}

export interface PriorityRule {
  conditions: {
    trigger?: EscalationTrigger[];
    emotionalState?: string[];
    timeOfDay?: { start: string; end: string };
    patientAge?: { min?: number; max?: number };
  };
  priority: EscalationPriority;
}