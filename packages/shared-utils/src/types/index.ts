// Common types for AI Voice Agent services

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
}

// Re-export conversation types first
export * from './conversation';
// Re-export escalation types (excluding duplicated types)
export {
  EscalationPriority,
  EscalationTrigger,
  EscalationStatus,
  EscalationTurn,
  EscalationEmotionalState,
  EscalationContext,
  EscalationEvent,
  StaffNotification,
  QuickAction,
  EscalationMetrics,
  EscalationConfig,
  PriorityRule
} from './escalation';