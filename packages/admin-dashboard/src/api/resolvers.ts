/**
 * GraphQL Resolvers for Dashboard API
 * Implements queries, mutations, and subscriptions
 */

import { PubSub } from 'graphql-subscriptions';
import { ActiveCall, Escalation, SystemStatus } from '../types/dashboard';

// Create PubSub instance for real-time subscriptions
export const pubsub = new PubSub();

// Subscription event types
export const SUBSCRIPTION_EVENTS = {
  CALL_STARTED: 'CALL_STARTED',
  CALL_UPDATED: 'CALL_UPDATED',
  CALL_ENDED: 'CALL_ENDED',
  ESCALATION_CREATED: 'ESCALATION_CREATED',
  ESCALATION_CLAIMED: 'ESCALATION_CLAIMED',
  ESCALATION_RESOLVED: 'ESCALATION_RESOLVED',
  SYSTEM_STATUS_CHANGED: 'SYSTEM_STATUS_CHANGED',
};

// Mock data stores (in production, these would be database calls)
const activeCalls: Map<string, ActiveCall> = new Map();
const escalations: Map<string, Escalation> = new Map();
const systemStatuses: SystemStatus[] = [
  {
    component: 'Voice AI Service',
    status: 'online',
    lastUpdate: new Date(),
    responseTime: 150,
  },
  {
    component: 'OpenEMR Connection',
    status: 'online',
    lastUpdate: new Date(),
    responseTime: 200,
  },
  {
    component: 'Queue System',
    status: 'online',
    lastUpdate: new Date(),
  },
];

export const resolvers = {
  // Date scalar resolver
  Date: {
    serialize: (date: Date) => date.toISOString(),
    parseValue: (value: string) => new Date(value),
    parseLiteral: (ast: any) => new Date(ast.value),
  },

  // Queries
  Query: {
    activeCalls: async (): Promise<ActiveCall[]> => {
      return Array.from(activeCalls.values());
    },

    escalations: async (): Promise<Escalation[]> => {
      return Array.from(escalations.values())
        .sort((a, b) => {
          // Sort by priority first, then by creation time
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return a.timing.createdAt.getTime() - b.timing.createdAt.getTime();
        });
    },

    systemStatus: async (): Promise<SystemStatus[]> => {
      return systemStatuses;
    },

    callDetails: async (_: any, { callId }: { callId: string }): Promise<ActiveCall | null> => {
      return activeCalls.get(callId) || null;
    },

    escalationDetails: async (_: any, { escalationId }: { escalationId: string }): Promise<Escalation | null> => {
      return escalations.get(escalationId) || null;
    },

    patientSearch: async (_: any, { query, limit = 10 }: { query?: string; limit?: number }) => {
      // Mock patient search - in production, this would query the database
      const mockPatients = [
        { name: 'John Smith', mrn: '12345', phone: '(555) 123-4567' },
        { name: 'Mary Johnson', mrn: '67890', phone: '(555) 987-6543' },
        { name: 'Robert Davis', mrn: '11111', phone: '(555) 111-1111' },
      ];

      if (!query) return mockPatients.slice(0, limit);

      return mockPatients
        .filter(patient =>
          patient.name.toLowerCase().includes(query.toLowerCase()) ||
          patient.mrn.includes(query) ||
          patient.phone.includes(query)
        )
        .slice(0, limit);
    },
  },

  // Mutations
  Mutation: {
    claimEscalation: async (_: any, { escalationId }: { escalationId: string }, context: any): Promise<Escalation | null> => {
      const escalation = escalations.get(escalationId);
      if (!escalation) {
        throw new Error('Escalation not found');
      }

      // Update escalation with staff assignment
      const updatedEscalation: Escalation = {
        ...escalation,
        timing: {
          ...escalation.timing,
          assignedTo: context.user?.id || 'current-staff',
          acknowledgedAt: new Date(),
        },
      };

      escalations.set(escalationId, updatedEscalation);

      // Publish subscription event
      pubsub.publish(SUBSCRIPTION_EVENTS.ESCALATION_CLAIMED, {
        escalationClaimed: {
          escalationId,
          staffId: context.user?.id || 'current-staff',
        },
      });

      return updatedEscalation;
    },

    reassignEscalation: async (
      _: any,
      { escalationId, newStaffId }: { escalationId: string; newStaffId: string }
    ): Promise<Escalation | null> => {
      const escalation = escalations.get(escalationId);
      if (!escalation) {
        throw new Error('Escalation not found');
      }

      const updatedEscalation: Escalation = {
        ...escalation,
        timing: {
          ...escalation.timing,
          assignedTo: newStaffId,
        },
      };

      escalations.set(escalationId, updatedEscalation);
      return updatedEscalation;
    },

    resolveEscalation: async (
      _: any,
      { escalationId, resolution }: { escalationId: string; resolution: any }
    ): Promise<Escalation | null> => {
      const escalation = escalations.get(escalationId);
      if (!escalation) {
        throw new Error('Escalation not found');
      }

      const updatedEscalation: Escalation = {
        ...escalation,
        timing: {
          ...escalation.timing,
          resolvedAt: new Date(),
        },
      };

      escalations.set(escalationId, updatedEscalation);

      // Publish subscription event
      pubsub.publish(SUBSCRIPTION_EVENTS.ESCALATION_RESOLVED, {
        escalationResolved: {
          escalationId,
          resolution,
        },
      });

      // Remove from active escalations after a delay
      setTimeout(() => {
        escalations.delete(escalationId);
      }, 5000);

      return updatedEscalation;
    },

    takeOverCall: async (_: any, { callId }: { callId: string }): Promise<ActiveCall | null> => {
      const call = activeCalls.get(callId);
      if (!call) {
        throw new Error('Call not found');
      }

      // In production, this would initiate call transfer logic
      console.log(`Staff taking over call ${callId}`);

      return call;
    },

    modifyAppointment: async (
      _: any,
      { appointmentId, changes }: { appointmentId: string; changes: any }
    ): Promise<boolean> => {
      // In production, this would update the appointment in OpenEMR
      console.log(`Modifying appointment ${appointmentId}:`, changes);
      return true;
    },
  },

  // Subscriptions
  Subscription: {
    callStarted: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.CALL_STARTED]),
    },

    callUpdated: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.CALL_UPDATED]),
    },

    callEnded: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.CALL_ENDED]),
    },

    escalationCreated: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ESCALATION_CREATED]),
    },

    escalationClaimed: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ESCALATION_CLAIMED]),
    },

    escalationResolved: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ESCALATION_RESOLVED]),
    },

    systemStatusChanged: {
      subscribe: () => pubsub.asyncIterator([SUBSCRIPTION_EVENTS.SYSTEM_STATUS_CHANGED]),
    },
  },
};

// Helper functions to simulate real-time events (for demo purposes)
export const simulateRealTimeEvents = () => {
  // Simulate new call every 30 seconds
  setInterval(() => {
    const newCall: ActiveCall = {
      callId: `call-${Date.now()}`,
      patientName: ['John Smith', 'Mary Johnson', 'Robert Davis'][Math.floor(Math.random() * 3)],
      patientMRN: `${Math.floor(Math.random() * 90000) + 10000}`,
      callDuration: 0,
      currentState: 'greeting',
      aiConfidence: 0.95,
      escalationRisk: 'low',
    };

    activeCalls.set(newCall.callId, newCall);

    pubsub.publish(SUBSCRIPTION_EVENTS.CALL_STARTED, {
      callStarted: newCall,
    });
  }, 30000);

  // Simulate escalation every 2 minutes
  setInterval(() => {
    const newEscalation: Escalation = {
      id: `esc-${Date.now()}`,
      priority: Math.random() > 0.8 ? 1 : Math.random() > 0.6 ? 2 : 3,
      type: 'verification_failure',
      patientInfo: {
        name: 'Jane Doe',
        mrn: '99999',
        phone: '(555) 999-9999',
      },
      context: {
        callTranscript: ['AI: Can you verify your date of birth?', 'Patient: I forgot...'],
        aiRecommendation: 'Transfer to staff for manual verification',
        triggerReason: 'Failed verification after 3 attempts',
      },
      timing: {
        createdAt: new Date(),
      },
      sla: {
        targetResponseTime: 120, // 2 minutes
        targetResolutionTime: 600, // 10 minutes
      },
    };

    escalations.set(newEscalation.id, newEscalation);

    pubsub.publish(SUBSCRIPTION_EVENTS.ESCALATION_CREATED, {
      escalationCreated: newEscalation,
    });
  }, 120000);
};