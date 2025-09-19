/**
 * Appointment Availability Query Processor
 * 
 * Processes natural language queries for appointment availability,
 * extracts entities, and handles contextual refinements
 */

import { AvailabilityService } from './availability-service';
import { AvailabilityResponseGenerator } from './availability-response-generator';
import { logger } from '@voice-agent/shared-utils';

export interface AvailabilityQuery {
  rawQuery: string;
  intent: 'appointment_availability' | 'appointment_refinement' | 'appointment_type_inquiry';
  entities: QueryEntity[];
  context?: QueryContext;
}

export interface QueryEntity {
  type: 'date' | 'time' | 'date_range' | 'time_preference' | 'appointment_type' | 'provider' | 'relative_time';
  value: string;
  normalized?: string;
  confidence: number;
}

export interface QueryContext {
  previousQuery?: string;
  previousSlots?: any[];
  conversationId: string;
  patientVerified: boolean;
}

export interface ProcessedQuery {
  startDate: string;
  endDate: string;
  appointmentType?: 'routine' | 'follow-up' | 'urgent';
  practitionerId?: string;
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  requiresClarification: boolean;
  clarificationType?: 'appointment_type' | 'time_preference' | 'date_range' | 'provider';
}

export class AvailabilityQueryProcessor {
  private availabilityService: AvailabilityService;
  private responseGenerator: AvailabilityResponseGenerator;

  constructor(
    availabilityService: AvailabilityService,
    responseGenerator: AvailabilityResponseGenerator
  ) {
    this.availabilityService = availabilityService;
    this.responseGenerator = responseGenerator;
  }

  /**
   * Process an availability query and return appropriate response
   */
  async processQuery(query: AvailabilityQuery): Promise<{
    response: string;
    slots?: any[];
    requiresFollowUp: boolean;
  }> {
    try {
      // Process the query to extract structured data
      const processedQuery = this.processAvailabilityQuery(query);

      // Check if clarification is needed
      if (processedQuery.requiresClarification) {
        return {
          response: this.responseGenerator.generateClarificationResponse(
            processedQuery.clarificationType || 'date_range'
          ),
          requiresFollowUp: true
        };
      }

      // Get available slots
      const slots = await this.availabilityService.getAvailableSlots({
        startDate: processedQuery.startDate,
        endDate: processedQuery.endDate,
        appointmentType: processedQuery.appointmentType,
        practitionerId: processedQuery.practitionerId,
        preferredTimeOfDay: processedQuery.preferredTimeOfDay
      });

      // Generate natural language response
      const response = this.responseGenerator.generateAvailabilityResponse(
        slots,
        query.rawQuery,
        {
          includeProvider: true,
          includeInstructions: true,
          maxOptions: 3
        }
      );

      return {
        response,
        slots,
        requiresFollowUp: slots.length > 0
      };
    } catch (error) {
      logger.error('Failed to process availability query', { error, query });
      return {
        response: "I'm having trouble checking appointment availability right now. Let me connect you with our scheduling team who can help you directly.",
        requiresFollowUp: true
      };
    }
  }

  /**
   * Process query to extract structured data
   */
  private processAvailabilityQuery(query: AvailabilityQuery): ProcessedQuery {
    const result: ProcessedQuery = {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 60 days default
      requiresClarification: false
    };

    // Extract date/time information
    const dateEntity = this.extractDateEntity(query.entities);
    if (dateEntity) {
      const dateRange = this.parseDateEntity(dateEntity);
      if (dateRange) {
        result.startDate = dateRange.startDate;
        result.endDate = dateRange.endDate;
      }
    }

    // Extract appointment type
    const appointmentTypeEntity = query.entities.find(e => e.type === 'appointment_type');
    if (appointmentTypeEntity) {
      result.appointmentType = this.normalizeAppointmentType(appointmentTypeEntity.value);
    }

    // Extract time preference
    const timePreference = this.extractTimePreference(query);
    if (timePreference) {
      result.preferredTimeOfDay = timePreference;
    }

    // Handle contextual refinements
    if (query.intent === 'appointment_refinement' && query.context?.previousQuery) {
      result.requiresClarification = this.handleRefinement(query, result);
    }

    // Check if we need clarification
    if (!dateEntity && !query.context?.previousQuery) {
      result.requiresClarification = true;
      result.clarificationType = 'date_range';
    }

    return result;
  }

  /**
   * Extract date entity from entities list
   */
  private extractDateEntity(entities: QueryEntity[]): QueryEntity | undefined {
    // Priority: date_range > date > relative_time
    return entities.find(e => e.type === 'date_range') ||
           entities.find(e => e.type === 'date') ||
           entities.find(e => e.type === 'relative_time');
  }

  /**
   * Parse date entity into date range
   */
  private parseDateEntity(entity: QueryEntity): { startDate: string; endDate: string } | null {
    // Try natural date parsing first
    const naturalParsed = this.availabilityService.parseNaturalDate(entity.value);
    if (naturalParsed) {
      return naturalParsed;
    }

    // Handle specific patterns
    const value = entity.value.toLowerCase();
    const today = new Date();

    // "Today"
    if (value.includes('today')) {
      const dateStr = today.toISOString().split('T')[0];
      return { startDate: dateStr, endDate: dateStr };
    }

    // "This month"
    if (value.includes('this month')) {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        startDate: startOfMonth.toISOString().split('T')[0],
        endDate: endOfMonth.toISOString().split('T')[0]
      };
    }

    // "Next month"
    if (value.includes('next month')) {
      const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      return {
        startDate: startOfNextMonth.toISOString().split('T')[0],
        endDate: endOfNextMonth.toISOString().split('T')[0]
      };
    }

    // Default: next 30 days
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    return {
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * Extract time preference from query
   */
  private extractTimePreference(query: AvailabilityQuery): 'morning' | 'afternoon' | 'evening' | undefined {
    // Check entities first
    const timePrefEntity = query.entities.find(e => e.type === 'time_preference');
    if (timePrefEntity) {
      return timePrefEntity.normalized as any;
    }

    // Check raw query
    const rawLower = query.rawQuery.toLowerCase();
    if (rawLower.includes('morning') || rawLower.includes('am')) {
      return 'morning';
    } else if (rawLower.includes('afternoon') || rawLower.includes('pm')) {
      return 'afternoon';
    } else if (rawLower.includes('evening')) {
      return 'evening';
    }

    return undefined;
  }

  /**
   * Normalize appointment type
   */
  private normalizeAppointmentType(value: string): 'routine' | 'follow-up' | 'urgent' {
    const normalized = value.toLowerCase();
    
    if (normalized.includes('routine') || normalized.includes('regular') || 
        normalized.includes('annual') || normalized.includes('check') || 
        normalized.includes('exam')) {
      return 'routine';
    }
    
    if (normalized.includes('follow') || normalized.includes('recheck')) {
      return 'follow-up';
    }
    
    if (normalized.includes('urgent') || normalized.includes('emergency') || 
        normalized.includes('asap') || normalized.includes('soon')) {
      return 'urgent';
    }
    
    return 'routine'; // Default
  }

  /**
   * Handle contextual refinements
   */
  private handleRefinement(query: AvailabilityQuery, result: ProcessedQuery): boolean {
    const refinement = query.rawQuery.toLowerCase();

    // Time refinements
    if (refinement.includes('earlier') || refinement.includes('sooner')) {
      // Adjust date range to prioritize earlier dates
      const today = new Date();
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      result.startDate = today.toISOString().split('T')[0];
      result.endDate = weekFromNow.toISOString().split('T')[0];
      return false;
    }

    if (refinement.includes('later') || refinement.includes('further')) {
      // Adjust date range to later dates
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const monthFromNow = new Date();
      monthFromNow.setDate(monthFromNow.getDate() + 30);
      result.startDate = weekFromNow.toISOString().split('T')[0];
      result.endDate = monthFromNow.toISOString().split('T')[0];
      return false;
    }

    // Different time of day
    if (refinement.includes('different time')) {
      result.clarificationType = 'time_preference';
      return true;
    }

    // Different provider
    if (refinement.includes('different doctor') || refinement.includes('another provider')) {
      result.clarificationType = 'provider';
      return true;
    }

    return false;
  }

  /**
   * Process varied patient phrasings into standard queries
   */
  normalizeQuery(rawQuery: string): string {
    const normalizations: Record<string, string[]> = {
      'appointment_availability': [
        'when can i come in',
        'do you have any openings',
        'what times are available',
        'when is the next available',
        'can i get an appointment',
        'i need to schedule',
        'are there any slots',
        'what appointments do you have'
      ],
      'appointment_type': {
        'eye exam': 'routine',
        'check up': 'routine',
        'annual exam': 'routine',
        'follow up': 'follow-up',
        'recheck': 'follow-up',
        'urgent care': 'urgent',
        'emergency': 'urgent'
      }
    };

    let normalized = rawQuery.toLowerCase().trim();

    // Apply normalizations
    for (const [intent, patterns] of Object.entries(normalizations)) {
      if (Array.isArray(patterns)) {
        for (const pattern of patterns) {
          if (normalized.includes(pattern)) {
            normalized = normalized.replace(pattern, intent);
          }
        }
      } else {
        // Handle appointment_type mapping (object)
        for (const [pattern, replacement] of Object.entries(patterns)) {
          if (normalized.includes(pattern)) {
            normalized = normalized.replace(pattern, replacement);
          }
        }
      }
    }

    return normalized;
  }
}