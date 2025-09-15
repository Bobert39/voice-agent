/**
 * Appointment Availability Integration for Conversation System
 * 
 * Bridges the NLU system with the scheduling service for
 * appointment availability queries
 */

import { IntentResult, ExtractedEntity } from '../nlu/intentRecognitionService';
import { ConversationContext } from '@voice-agent/shared-utils/types/conversation';
import { logger } from '@voice-agent/shared-utils';
import axios from 'axios';

export interface AppointmentAvailabilityHandler {
  handleAvailabilityQuery(
    intent: IntentResult,
    context: ConversationContext
  ): Promise<{
    response: string;
    requiresFollowUp: boolean;
    context?: any;
  }>;
}

export class AppointmentAvailabilityIntegration implements AppointmentAvailabilityHandler {
  private schedulingServiceUrl: string;

  constructor(schedulingServiceUrl: string = process.env.SCHEDULING_SERVICE_URL || 'http://localhost:3003') {
    this.schedulingServiceUrl = schedulingServiceUrl;
  }

  /**
   * Handle appointment availability queries
   */
  async handleAvailabilityQuery(
    intent: IntentResult,
    context: ConversationContext
  ): Promise<{
    response: string;
    requiresFollowUp: boolean;
    context?: any;
  }> {
    try {
      // Check if patient is verified
      if (!context.patientVerified) {
        return {
          response: "I'd be happy to help you check appointment availability. First, I'll need to verify your identity for security purposes. Can you please tell me your first and last name?",
          requiresFollowUp: true,
          context: { needsVerification: true }
        };
      }

      // Build query from intent and entities
      const query = this.buildAvailabilityQuery(intent, context);

      // Call scheduling service
      const response = await axios.post(
        `${this.schedulingServiceUrl}/api/v1/availability/query`,
        {
          query,
          patientId: context.patientId,
          sessionId: context.sessionId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': context.sessionId
          }
        }
      );

      return {
        response: response.data.response,
        requiresFollowUp: response.data.requiresFollowUp,
        context: {
          availableSlots: response.data.slots,
          queryContext: query
        }
      };
    } catch (error) {
      logger.error('Failed to handle availability query', { error, intent, context });
      
      // Graceful fallback
      return {
        response: "I'm having trouble checking our appointment system right now. Would you like me to connect you with our scheduling team who can help you directly?",
        requiresFollowUp: true,
        context: { error: true, needsEscalation: true }
      };
    }
  }

  /**
   * Build availability query from intent and context
   */
  private buildAvailabilityQuery(intent: IntentResult, context: ConversationContext): any {
    const query: any = {
      rawQuery: context.currentUtterance || '',
      intent: intent.intent as any,
      entities: this.processEntities(intent.entities),
      context: {
        conversationId: context.sessionId,
        patientVerified: context.patientVerified,
        previousQuery: context.conversationHistory?.slice(-2, -1)[0]?.userInput
      }
    };

    // Add previous slots if this is a refinement
    if (intent.intent === 'appointment_refinement' && context.customData?.availableSlots) {
      query.context.previousSlots = context.customData.availableSlots;
    }

    return query;
  }

  /**
   * Process entities for scheduling service
   */
  private processEntities(entities: ExtractedEntity[]): any[] {
    return entities.map(entity => {
      const processed: any = {
        type: entity.type,
        value: entity.value,
        confidence: entity.confidence
      };

      // Normalize specific entity types
      if (entity.type === 'date' || entity.type === 'relative_time') {
        processed.normalized = this.normalizeDateEntity(entity.value);
      } else if (entity.type === 'time_preference') {
        processed.normalized = this.normalizeTimePreference(entity.value);
      } else if (entity.type === 'appointment_type') {
        processed.normalized = this.normalizeAppointmentType(entity.value);
      }

      return processed;
    });
  }

  /**
   * Normalize date entities
   */
  private normalizeDateEntity(value: string): string {
    const normalized = value.toLowerCase();
    
    // Map common phrases
    const mappings: Record<string, string> = {
      'as soon as possible': 'asap',
      'earliest available': 'asap',
      'this week': 'this week',
      'next week': 'next week',
      'tomorrow': 'tomorrow',
      'today': 'today'
    };

    for (const [phrase, mapped] of Object.entries(mappings)) {
      if (normalized.includes(phrase)) {
        return mapped;
      }
    }

    return value;
  }

  /**
   * Normalize time preferences
   */
  private normalizeTimePreference(value: string): 'morning' | 'afternoon' | 'evening' {
    const normalized = value.toLowerCase();
    
    if (normalized.includes('morning') || normalized.includes('am')) {
      return 'morning';
    } else if (normalized.includes('afternoon') || normalized.includes('pm')) {
      return 'afternoon';
    } else if (normalized.includes('evening') || normalized.includes('night')) {
      return 'evening';
    }
    
    return 'morning'; // Default
  }

  /**
   * Normalize appointment types
   */
  private normalizeAppointmentType(value: string): 'routine' | 'follow-up' | 'urgent' {
    const normalized = value.toLowerCase();
    
    if (normalized.includes('routine') || normalized.includes('regular') || 
        normalized.includes('check') || normalized.includes('exam')) {
      return 'routine';
    }
    
    if (normalized.includes('follow') || normalized.includes('recheck')) {
      return 'follow-up';
    }
    
    if (normalized.includes('urgent') || normalized.includes('emergency')) {
      return 'urgent';
    }
    
    return 'routine'; // Default
  }

  /**
   * Check if scheduling service is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.schedulingServiceUrl}/health`);
      return response.data.status === 'healthy';
    } catch (error) {
      logger.error('Scheduling service health check failed', { error });
      return false;
    }
  }
}