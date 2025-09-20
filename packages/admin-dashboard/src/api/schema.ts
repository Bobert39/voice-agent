/**
 * GraphQL Schema for Dashboard API
 * Defines types, queries, mutations, and subscriptions
 */

import { gql } from 'graphql-tag';

export const typeDefs = gql`
  scalar Date

  enum CallState {
    GREETING
    VERIFICATION
    INQUIRY
    SCHEDULING
    CLOSING
  }

  enum EscalationRisk {
    LOW
    MEDIUM
    HIGH
  }

  enum EscalationPriority {
    CRITICAL
    HIGH
    MEDIUM
    LOW
  }

  enum EscalationType {
    VERIFICATION_FAILURE
    SCHEDULING_CONFLICT
    PATIENT_CONFUSION
    TECHNICAL_ISSUE
    EMERGENCY
  }

  enum SystemStatusType {
    ONLINE
    OFFLINE
    DEGRADED
  }

  enum Speaker {
    AI
    PATIENT
  }

  enum Sentiment {
    POSITIVE
    NEUTRAL
    NEGATIVE
  }

  type ActiveCall {
    callId: ID!
    patientName: String!
    patientMRN: String!
    callDuration: Int!
    currentState: CallState!
    aiConfidence: Float!
    escalationRisk: EscalationRisk!
    audioStreamUrl: String
  }

  type PatientInfo {
    name: String!
    mrn: String!
    phone: String!
  }

  type EscalationContext {
    callTranscript: [String!]!
    aiRecommendation: String!
    triggerReason: String!
  }

  type EscalationTiming {
    createdAt: Date!
    assignedTo: String
    acknowledgedAt: Date
    resolvedAt: Date
  }

  type EscalationSLA {
    targetResponseTime: Int!
    targetResolutionTime: Int!
  }

  type Escalation {
    id: ID!
    priority: EscalationPriority!
    type: EscalationType!
    patientInfo: PatientInfo!
    context: EscalationContext!
    timing: EscalationTiming!
    sla: EscalationSLA!
  }

  type SystemStatus {
    component: String!
    status: SystemStatusType!
    lastUpdate: Date!
    responseTime: Int
  }

  type TranscriptEntry {
    timestamp: Date!
    speaker: Speaker!
    text: String!
    confidence: Float!
    sentiment: Sentiment!
    intent: String
    entities: String
  }

  type CallOutcome {
    outcome: String!
    appointmentScheduled: Boolean!
    escalationCreated: Boolean!
    duration: Int!
    summary: String
  }

  type Resolution {
    resolutionType: String!
    notes: String!
    followUpRequired: Boolean!
  }

  # Queries
  type Query {
    activeCalls: [ActiveCall!]!
    escalations: [Escalation!]!
    systemStatus: [SystemStatus!]!
    callDetails(callId: ID!): ActiveCall
    escalationDetails(escalationId: ID!): Escalation
    patientSearch(query: String, limit: Int): [PatientInfo!]!
  }

  # Mutations
  type Mutation {
    claimEscalation(escalationId: ID!): Escalation
    reassignEscalation(escalationId: ID!, newStaffId: ID!): Escalation
    resolveEscalation(escalationId: ID!, resolution: ResolutionInput!): Escalation
    takeOverCall(callId: ID!): ActiveCall
    modifyAppointment(appointmentId: ID!, changes: AppointmentInput!): Boolean
  }

  # Subscriptions for real-time updates
  type Subscription {
    callStarted: ActiveCall
    callUpdated: CallUpdatePayload
    callEnded: CallEndedPayload
    escalationCreated: Escalation
    escalationClaimed: EscalationClaimedPayload
    escalationResolved: EscalationResolvedPayload
    systemStatusChanged: SystemStatus
  }

  # Input types for mutations
  input ResolutionInput {
    resolutionType: String!
    notes: String!
    followUpRequired: Boolean!
  }

  input AppointmentInput {
    dateTime: Date
    provider: String
    reason: String
  }

  # Subscription payload types
  type CallUpdatePayload {
    callId: ID!
    updates: ActiveCall!
  }

  type CallEndedPayload {
    callId: ID!
    outcome: CallOutcome!
  }

  type EscalationClaimedPayload {
    escalationId: ID!
    staffId: ID!
  }

  type EscalationResolvedPayload {
    escalationId: ID!
    resolution: Resolution!
  }
`;