// Application constants
export const SERVICE_PORTS = {
  VOICE_AI_SERVICE: 3001,
  SCHEDULING_SERVICE: 3002,
  PATIENT_VERIFICATION_SERVICE: 3003,
  AUDIT_SERVICE: 3004,
  PRACTICE_INFO_SERVICE: 3005,
  ADMIN_DASHBOARD: 3000
} as const;

export const API_VERSIONS = {
  V1: 'v1'
} as const;

// Escalation response time SLAs (in milliseconds)
export const ESCALATION_SLA = {
  CRITICAL: 2 * 60 * 1000,  // 2 minutes
  HIGH: 5 * 60 * 1000,      // 5 minutes
  NORMAL: 15 * 60 * 1000,   // 15 minutes
  LOW: 60 * 60 * 1000       // 60 minutes
} as const;

// WebSocket events for real-time notifications
export const WS_EVENTS = {
  // Escalation events
  ESCALATION_TRIGGERED: 'escalation:triggered',
  ESCALATION_ACKNOWLEDGED: 'escalation:acknowledged',
  ESCALATION_RESOLVED: 'escalation:resolved',
  
  // Staff events
  STAFF_CONNECTED: 'staff:connected',
  STAFF_DISCONNECTED: 'staff:disconnected',
  STAFF_STATUS_UPDATE: 'staff:status_update',
  
  // System events
  HEARTBEAT: 'heartbeat',
  ERROR: 'error'
} as const;

// Escalation detection thresholds
export const ESCALATION_THRESHOLDS = {
  EMOTIONAL_DISTRESS_SCORE: -0.7,  // Sentiment score below this triggers escalation
  FRUSTRATION_KEYWORDS_COUNT: 3,    // Number of frustration keywords to trigger
  MISUNDERSTANDING_LIMIT: 3,        // Max misunderstandings before escalation
  VERIFICATION_ATTEMPT_LIMIT: 3,    // Max verification attempts
  CONVERSATION_TIMEOUT_MINUTES: 30  // Timeout for inactive conversations
} as const;