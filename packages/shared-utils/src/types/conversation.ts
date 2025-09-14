// Conversation management types for multi-turn dialogue

export interface ConversationTurn {
  id: string;
  timestamp: Date;
  speaker: 'patient' | 'ai' | 'system';
  text: string;
  intent?: string;
  confidence?: number;
  sentiment?: number;
  emotionalMarkers?: string[];
  topics?: string[];
  entities?: ConversationEntity[];
  followUpRequired?: boolean;
}

export interface ConversationEntity {
  type: 'appointment' | 'doctor' | 'insurance' | 'date' | 'time' | 'symptom' | 'medication' | 'other';
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface ConversationState {
  // Core identifiers
  conversationId: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  
  // State management
  status: ConversationStatus;
  currentTopic?: string;
  previousTopics: string[];
  contextualMemory: ContextualMemory;
  
  // Conversation flow
  turns: ConversationTurn[];
  currentIntent?: string;
  intentHistory: string[];
  conversationGoals: string[];
  completedGoals: string[];
  pendingActions: PendingAction[];
  
  // Timing and duration
  startTime: Date;
  lastActivity: Date;
  totalDuration: number;
  expectedEndTime?: Date;
  
  // Quality metrics
  misunderstandingCount: number;
  clarificationRequests: number;
  topicSwitches: number;
  userSatisfactionScore?: number;
  
  // Patient state
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed';
  verificationAttempts: number;
  emotionalState?: EmotionalState;
  
  // AI assistant state
  conversationSummary?: string;
  keyInsights: string[];
  recommendedActions: string[];
  escalationFlags: string[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export enum ConversationStatus {
  INITIATED = 'initiated',
  ACTIVE = 'active',
  WAITING_PATIENT = 'waiting_patient',
  WAITING_AI = 'waiting_ai',
  CLARIFYING = 'clarifying',
  PROCESSING = 'processing',
  COMPLETING = 'completing',
  ENDED_NATURALLY = 'ended_naturally',
  ENDED_BY_PATIENT = 'ended_by_patient',
  ENDED_BY_TIMEOUT = 'ended_by_timeout',
  ESCALATED = 'escalated',
  HANDED_OFF = 'handed_off',
  ERROR = 'error'
}

export interface ContextualMemory {
  // Short-term memory (current conversation)
  recentTopics: string[];
  mentionedEntities: ConversationEntity[];
  userPreferences: Record<string, any>;
  
  // Medium-term memory (this session)
  sessionGoals: string[];
  discussedTopics: string[];
  resolvedIssues: string[];
  
  // Long-term memory (patient history)
  patientPreferences?: Record<string, any>;
  previousInteractions?: ConversationSummary[];
  knownInformation?: PatientKnowledge;
}

export interface ConversationSummary {
  conversationId: string;
  date: Date;
  duration: number;
  mainTopics: string[];
  outcome: string;
  satisfactionScore?: number;
  nextActions?: string[];
}

export interface PatientKnowledge {
  preferredDoctors?: string[];
  insuranceProvider?: string;
  typicalAppointmentTypes?: string[];
  communicationPreferences?: {
    pace: 'slow' | 'normal' | 'fast';
    detailLevel: 'brief' | 'moderate' | 'detailed';
    confirmationStyle: 'frequent' | 'normal' | 'minimal';
  };
  accessibilityNeeds?: string[];
  languagePreferences?: string[];
}

export interface PendingAction {
  id: string;
  type: 'schedule_appointment' | 'transfer_call' | 'send_information' | 'follow_up' | 'escalate';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  deadline?: Date;
  parameters: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
}

export interface EmotionalState {
  overall: 'very_positive' | 'positive' | 'neutral' | 'concerned' | 'frustrated' | 'distressed' | 'angry';
  confidence: number;
  markers: string[];
  trends: EmotionalTrend[];
  lastUpdated: Date;
}

export interface EmotionalTrend {
  timestamp: Date;
  state: EmotionalState['overall'];
  trigger?: string;
  confidence: number;
}

// Conversation flow management
export interface ConversationFlow {
  currentPhase: ConversationPhase;
  availableTransitions: ConversationTransition[];
  phaseHistory: ConversationPhaseHistory[];
  flowRules: FlowRule[];
}

export enum ConversationPhase {
  GREETING = 'greeting',
  PATIENT_VERIFICATION = 'patient_verification',
  INTENT_DISCOVERY = 'intent_discovery',
  INFORMATION_GATHERING = 'information_gathering',
  INFORMATION_PROVIDING = 'information_providing',
  ACTION_PLANNING = 'action_planning',
  CONFIRMATION = 'confirmation',
  RESOLUTION = 'resolution',
  CLOSURE = 'closure',
  ESCALATION = 'escalation'
}

export interface ConversationTransition {
  from: ConversationPhase;
  to: ConversationPhase;
  trigger: string;
  condition?: (state: ConversationState) => boolean;
  action?: (state: ConversationState) => Promise<ConversationState>;
}

export interface ConversationPhaseHistory {
  phase: ConversationPhase;
  enteredAt: Date;
  exitedAt?: Date;
  duration?: number;
  successful: boolean;
  notes?: string;
}

export interface FlowRule {
  id: string;
  name: string;
  condition: (state: ConversationState) => boolean;
  action: (state: ConversationState) => Promise<ConversationState>;
  priority: number;
  active: boolean;
}

// Conversation ending and timeout handling
export interface ConversationEnding {
  type: 'natural' | 'timeout' | 'escalation' | 'error' | 'patient_request';
  reason?: string;
  finalMessage?: string;
  nextSteps?: string[];
  followUpRequired: boolean;
  followUpDate?: Date;
  handoffSummary?: string;
  patientSatisfied?: boolean;
  completedGoals: string[];
  incompleteGoals: string[];
}

export interface ConversationTimeout {
  warningThresholds: number[]; // seconds before timeout
  finalTimeout: number; // seconds
  warningMessages: string[];
  timeoutMessage: string;
  gracePeriod: number; // additional seconds after timeout
  escalationOnTimeout: boolean;
}

// Multi-turn conversation management
export interface TurnContext {
  turnNumber: number;
  previousTurn?: ConversationTurn;
  topicContinuity: boolean;
  requiresClarification: boolean;
  referencesHistory: boolean;
  contextualReferences: ContextualReference[];
}

export interface ContextualReference {
  type: 'previous_turn' | 'entity_mention' | 'topic_reference' | 'goal_reference';
  turnId?: string;
  entityId?: string;
  confidence: number;
  description: string;
}

// Analytics and insights
export interface ConversationAnalytics {
  conversationId: string;
  quality: ConversationQuality;
  efficiency: ConversationEfficiency;
  patientExperience: PatientExperienceMetrics;
  aiPerformance: AIPerformanceMetrics;
}

export interface ConversationQuality {
  overallScore: number; // 0-100
  clarityScore: number;
  completenessScore: number;
  empathyScore: number;
  professionalismScore: number;
  accuracyScore: number;
}

export interface ConversationEfficiency {
  turnsToResolution: number;
  averageTurnLength: number;
  topicSwitchFrequency: number;
  timeToFirstIntent: number;
  goalCompletionRate: number;
  redundancyScore: number;
}

export interface PatientExperienceMetrics {
  waitTimes: number[];
  frustrationIndicators: number;
  satisfactionSignals: number;
  engagementLevel: 'low' | 'medium' | 'high';
  communicationMatch: boolean;
  accessibilityCompliance: boolean;
}

export interface AIPerformanceMetrics {
  intentRecognitionAccuracy: number;
  entityExtractionAccuracy: number;
  responseRelevance: number;
  contextMaintenance: number;
  escalationAppropriate: boolean;
  knowledgeGaps: string[];
}