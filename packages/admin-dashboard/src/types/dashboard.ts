/**
 * Core dashboard types for staff monitoring interface
 * Based on Story 4.2 technical requirements
 */

export interface ActiveCall {
  callId: string;
  patientName: string;
  patientMRN: string;
  callDuration: number;
  currentState: 'greeting' | 'verification' | 'inquiry' | 'scheduling' | 'closing';
  aiConfidence: number;
  escalationRisk: 'low' | 'medium' | 'high';
  audioStreamUrl?: string;
}

export enum EscalationPriority {
  CRITICAL = 1,  // Patient distress, medical emergency
  HIGH = 2,      // Verification failures, appointment conflicts
  MEDIUM = 3,    // Complex scheduling requests, confusion
  LOW = 4        // General questions, feedback
}

export interface Escalation {
  id: string;
  priority: EscalationPriority;
  type: 'verification_failure' | 'scheduling_conflict' | 'patient_confusion' | 'technical_issue' | 'emergency';
  patientInfo: {
    name: string;
    mrn: string;
    phone: string;
  };
  context: {
    callTranscript: string[];
    aiRecommendation: string;
    triggerReason: string;
  };
  timing: {
    createdAt: Date;
    assignedTo?: string;
    acknowledgedAt?: Date;
    resolvedAt?: Date;
  };
  sla: {
    targetResponseTime: number; // seconds
    targetResolutionTime: number; // seconds
  };
}

export interface TranscriptEntry {
  timestamp: Date;
  speaker: 'AI' | 'PATIENT';
  text: string;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  intent?: string;
  entities?: Record<string, string>;
}

export interface PatientSearchParams {
  query?: string;          // Name, MRN, phone
  dateRange?: DateRange;
  interactionType?: 'call' | 'appointment' | 'inquiry';
  status?: 'completed' | 'escalated' | 'failed';
  staffMember?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface AppointmentOverride {
  originalAppointment: {
    id: string;
    dateTime: Date;
    provider: string;
    type: string;
    aiScheduled: boolean;
  };
  override: {
    action: 'modify' | 'cancel' | 'confirm';
    newDateTime?: Date;
    newProvider?: string;
    reason: string;
    staffId: string;
  };
  validation: {
    conflicts: ConflictCheck[];
    warnings: string[];
    requiresApproval: boolean;
  };
}

export interface ConflictCheck {
  type: 'time_conflict' | 'provider_unavailable' | 'resource_conflict';
  description: string;
  severity: 'warning' | 'error';
}

export enum StaffRole {
  RECEPTIONIST = 'receptionist',
  MEDICAL_ASSISTANT = 'medical_assistant',
  SUPERVISOR = 'supervisor',
  ADMIN = 'admin'
}

export interface RolePermissions {
  viewActiveCalls: boolean;
  listenToLiveCalls: boolean;
  takeOverCalls: boolean;
  viewTranscripts: boolean;
  modifyAppointments: boolean;
  viewAuditLogs: boolean;
  configureSystem: boolean;
  viewAnalytics: boolean;
}

export interface SystemStatus {
  component: string;
  status: 'online' | 'offline' | 'degraded';
  lastUpdate: Date;
  responseTime?: number;
}

export interface CallOutcome {
  outcome: 'completed' | 'escalated' | 'transferred' | 'abandoned';
  appointmentScheduled: boolean;
  escalationCreated: boolean;
  duration: number;
  summary?: string;
}

export interface Resolution {
  resolutionType: 'resolved' | 'forwarded' | 'cancelled';
  notes: string;
  followUpRequired: boolean;
}

// WebSocket Event Types
export interface DashboardEvents {
  'call:started': { call: ActiveCall };
  'call:updated': { callId: string; updates: Partial<ActiveCall> };
  'call:ended': { callId: string; outcome: CallOutcome };
  'escalation:new': { escalation: Escalation };
  'escalation:claimed': { escalationId: string; staffId: string };
  'escalation:resolved': { escalationId: string; resolution: Resolution };
  'system:status': { component: string; status: SystemStatus };
}

export interface StaffActions {
  'escalation:claim': { escalationId: string };
  'escalation:reassign': { escalationId: string; newStaffId: string };
  'call:monitor': { callId: string };
  'call:takeover': { callId: string };
  'appointment:override': { override: AppointmentOverride };
}

// Role permissions mapping
export const rolePermissions: Record<StaffRole, RolePermissions> = {
  [StaffRole.RECEPTIONIST]: {
    viewActiveCalls: true,
    listenToLiveCalls: false,
    takeOverCalls: true,
    viewTranscripts: true,
    modifyAppointments: true,
    viewAuditLogs: false,
    configureSystem: false,
    viewAnalytics: false
  },
  [StaffRole.MEDICAL_ASSISTANT]: {
    viewActiveCalls: true,
    listenToLiveCalls: false,
    takeOverCalls: true,
    viewTranscripts: true,
    modifyAppointments: true,
    viewAuditLogs: false,
    configureSystem: false,
    viewAnalytics: false
  },
  [StaffRole.SUPERVISOR]: {
    viewActiveCalls: true,
    listenToLiveCalls: true,
    takeOverCalls: true,
    viewTranscripts: true,
    modifyAppointments: true,
    viewAuditLogs: true,
    configureSystem: true,
    viewAnalytics: true
  },
  [StaffRole.ADMIN]: {
    viewActiveCalls: true,
    listenToLiveCalls: true,
    takeOverCalls: true,
    viewTranscripts: true,
    modifyAppointments: true,
    viewAuditLogs: true,
    configureSystem: true,
    viewAnalytics: true
  }
};