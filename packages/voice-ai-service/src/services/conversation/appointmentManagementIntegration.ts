/**
 * Appointment Management Integration
 * 
 * Bridges the NLU system with the scheduling service for 
 * Story 3.3 appointment management functionality.
 */

import { IntentResult, ExtractedEntity } from '../nlu/intentRecognitionService';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('appointment-management-integration');

interface SchedulingServiceClient {
  lookupAppointments(request: any): Promise<any>;
  verifyAppointmentAccess(conversationId: string, phoneNumber?: string, dateOfBirth?: string, lastName?: string): Promise<any>;
  modifyAppointment(request: any): Promise<any>;
  rescheduleAppointment(request: any): Promise<any>;
  confirmReschedule(appointmentId: string, patientId: string, newSlotId: string, conversationId: string): Promise<any>;
  processAppointmentManagementQuery(query: string, conversationId: string, patientId?: string): Promise<any>;
}

export class AppointmentManagementIntegration {
  private schedulingClient: SchedulingServiceClient;

  constructor(schedulingClient: SchedulingServiceClient) {
    this.schedulingClient = schedulingClient;
  }

  /**
   * Process appointment management intent with NLU results
   */
  async processAppointmentManagementIntent(
    intentResult: IntentResult,
    originalQuery: string,
    conversationId: string,
    conversationContext: any
  ): Promise<{
    response: string;
    requiresFollowUp: boolean;
    requiresVerification?: boolean;
    conversationUpdate?: any;
  }> {
    try {
      logger.debug('Processing appointment management intent', {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        conversationId
      });

      // Handle different appointment management intents
      switch (intentResult.intent) {
        case 'appointment_lookup':
          return await this.handleAppointmentLookup(intentResult, conversationId, conversationContext);

        case 'appointment_cancel':
          return await this.handleAppointmentCancellation(intentResult, conversationId, conversationContext);

        case 'appointment_reschedule':
        case 'appointment_modification':
          return await this.handleAppointmentReschedule(intentResult, conversationId, conversationContext);

        case 'appointment_type_change':
          return await this.handleAppointmentTypeChange(intentResult, conversationId, conversationContext);

        case 'confirmation_number_inquiry':
          return await this.handleConfirmationNumberLookup(intentResult, conversationId, conversationContext);

        case 'appointment_verification':
          return await this.handleAppointmentVerification(intentResult, conversationId, conversationContext);

        case 'appointment_confirm':
          return await this.handleAppointmentConfirmation(intentResult, conversationId, conversationContext);

        default:
          // Use the general appointment management query processor
          const result = await this.schedulingClient.processAppointmentManagementQuery(
            originalQuery,
            conversationId,
            conversationContext?.patientId
          );

          return {
            response: result.response,
            requiresFollowUp: result.requiresFollowUp,
            requiresVerification: result.requiresVerification,
            conversationUpdate: result.appointmentData ? {
              appointmentContext: result.appointmentData
            } : undefined
          };
      }

    } catch (error) {
      logger.error('Failed to process appointment management intent', { error, intentResult, conversationId });
      return {
        response: "I'm having trouble with appointment management right now. Let me connect you with our staff who can help you directly.",
        requiresFollowUp: false
      };
    }
  }

  /**
   * Handle appointment lookup requests
   */
  private async handleAppointmentLookup(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    // Extract entities for lookup
    const confirmationNumber = this.extractEntity(intentResult.entities, 'confirmation_number');
    const phoneNumber = this.extractEntity(intentResult.entities, 'phone_number');

    // Check if we have patient ID from conversation context
    const patientId = conversationContext?.patientId || conversationContext?.verificationStatus?.patientId;

    const lookupRequest = {
      conversationId,
      confirmationNumber: confirmationNumber?.value,
      phoneNumber: phoneNumber?.value,
      patientId
    };

    const result = await this.schedulingClient.lookupAppointments(lookupRequest);

    return {
      response: result.message,
      requiresFollowUp: result.success,
      requiresVerification: result.requiresVerification,
      conversationUpdate: result.appointments ? {
        appointmentContext: result.appointments,
        awaitingAction: 'appointment_selected'
      } : undefined
    };
  }

  /**
   * Handle appointment cancellation
   */
  private async handleAppointmentCancellation(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    // Check if we have appointment context
    const appointmentContext = conversationContext?.appointmentContext;
    
    if (!appointmentContext) {
      return {
        response: "I need to find your appointment first. Could you please provide your confirmation number or phone number?",
        requiresFollowUp: true,
        conversationUpdate: {
          awaitingAction: 'appointment_lookup_for_cancellation'
        }
      };
    }

    // If multiple appointments, need user to specify which one
    if (Array.isArray(appointmentContext) && appointmentContext.length > 1) {
      return {
        response: "I found multiple appointments. Which one would you like to cancel? Please tell me the date or confirmation number of the appointment you want to cancel.",
        requiresFollowUp: true,
        conversationUpdate: {
          awaitingAction: 'appointment_selection_for_cancellation'
        }
      };
    }

    const appointment = Array.isArray(appointmentContext) ? appointmentContext[0] : appointmentContext;
    const reason = this.extractEntity(intentResult.entities, 'other')?.value || 'Patient requested cancellation';

    const cancellationRequest = {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      modificationType: 'cancel' as const,
      reason,
      conversationId
    };

    const result = await this.schedulingClient.modifyAppointment(cancellationRequest);

    return {
      response: result.message,
      requiresFollowUp: false,
      conversationUpdate: {
        appointmentContext: null,
        lastAction: 'appointment_cancelled'
      }
    };
  }

  /**
   * Handle appointment rescheduling
   */
  private async handleAppointmentReschedule(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    const appointmentContext = conversationContext?.appointmentContext;
    
    if (!appointmentContext) {
      return {
        response: "I need to find your appointment first. Could you please provide your confirmation number or phone number?",
        requiresFollowUp: true,
        conversationUpdate: {
          awaitingAction: 'appointment_lookup_for_reschedule'
        }
      };
    }

    const appointment = Array.isArray(appointmentContext) ? appointmentContext[0] : appointmentContext;
    
    // Extract time preferences from entities
    const timePreference = this.extractEntity(intentResult.entities, 'time_preference');
    const datePreference = this.extractEntity(intentResult.entities, 'date');
    const relativeTime = this.extractEntity(intentResult.entities, 'relative_time');

    const rescheduleRequest = {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      preferredTimeOfDay: timePreference?.value,
      preferredDateTime: datePreference?.value,
      conversationId
    };

    // Add date range based on relative time
    if (relativeTime?.value) {
      rescheduleRequest.dateRange = this.parseRelativeTimeToDateRange(relativeTime.value);
    }

    const result = await this.schedulingClient.rescheduleAppointment(rescheduleRequest);

    return {
      response: result.message,
      requiresFollowUp: result.success,
      conversationUpdate: result.availableSlots ? {
        availableSlots: result.availableSlots,
        originalAppointment: result.originalAppointment,
        awaitingAction: 'slot_selection_for_reschedule'
      } : undefined
    };
  }

  /**
   * Handle appointment type changes
   */
  private async handleAppointmentTypeChange(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    const appointmentContext = conversationContext?.appointmentContext;
    
    if (!appointmentContext) {
      return {
        response: "I need to find your appointment first. Could you provide your confirmation number?",
        requiresFollowUp: true,
        conversationUpdate: {
          awaitingAction: 'appointment_lookup_for_type_change'
        }
      };
    }

    const appointment = Array.isArray(appointmentContext) ? appointmentContext[0] : appointmentContext;
    const newType = this.extractEntity(intentResult.entities, 'appointment_type')?.value;

    if (!newType) {
      return {
        response: "What type of appointment would you like to change it to? Routine, follow-up, or urgent?",
        requiresFollowUp: true,
        conversationUpdate: {
          awaitingAction: 'appointment_type_specification'
        }
      };
    }

    const typeChangeRequest = {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      modificationType: 'change_type' as const,
      newAppointmentType: newType as 'routine' | 'follow-up' | 'urgent',
      conversationId
    };

    const result = await this.schedulingClient.modifyAppointment(typeChangeRequest);

    return {
      response: result.message,
      requiresFollowUp: false,
      conversationUpdate: {
        appointmentContext: result.updatedAppointment,
        lastAction: 'appointment_type_changed'
      }
    };
  }

  /**
   * Handle confirmation number lookup
   */
  private async handleConfirmationNumberLookup(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    const confirmationNumber = this.extractEntity(intentResult.entities, 'confirmation_number');

    if (!confirmationNumber) {
      return {
        response: "I need your confirmation number to look up your appointment. Could you please provide it?",
        requiresFollowUp: true
      };
    }

    const lookupRequest = {
      conversationId,
      confirmationNumber: confirmationNumber.value
    };

    const result = await this.schedulingClient.lookupAppointments(lookupRequest);

    return {
      response: result.message,
      requiresFollowUp: result.success,
      conversationUpdate: result.appointments ? {
        appointmentContext: result.appointments
      } : undefined
    };
  }

  /**
   * Handle appointment verification
   */
  private async handleAppointmentVerification(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    const phoneNumber = this.extractEntity(intentResult.entities, 'phone_number');
    const dateOfBirth = this.extractEntity(intentResult.entities, 'date_of_birth');
    const patientName = this.extractEntity(intentResult.entities, 'patient_name');

    const result = await this.schedulingClient.verifyAppointmentAccess(
      conversationId,
      phoneNumber?.value,
      dateOfBirth?.value,
      patientName?.value
    );

    return {
      response: result.message,
      requiresFollowUp: result.success,
      requiresVerification: result.requiresVerification,
      conversationUpdate: result.appointments ? {
        appointmentContext: result.appointments,
        verificationStatus: { verified: true }
      } : undefined
    };
  }

  /**
   * Handle appointment confirmation
   */
  private async handleAppointmentConfirmation(
    intentResult: IntentResult,
    conversationId: string,
    conversationContext: any
  ): Promise<any> {
    const appointmentContext = conversationContext?.appointmentContext;
    
    if (!appointmentContext) {
      return await this.handleAppointmentLookup(intentResult, conversationId, conversationContext);
    }

    // Generate confirmation response
    const appointment = Array.isArray(appointmentContext) ? appointmentContext[0] : appointmentContext;
    const date = new Date(appointment.datetime);
    const dateStr = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });

    return {
      response: `Yes, your ${appointment.type} appointment with ${appointment.practitionerName} is confirmed for ${dateStr} at ${timeStr}. Your confirmation number is ${appointment.confirmationNumber}. Is there anything you'd like to change about this appointment?`,
      requiresFollowUp: true,
      conversationUpdate: {
        lastAction: 'appointment_confirmed'
      }
    };
  }

  /**
   * Extract specific entity type from entities array
   */
  private extractEntity(entities: ExtractedEntity[], type: string): ExtractedEntity | undefined {
    return entities.find(entity => entity.type === type);
  }

  /**
   * Parse relative time expressions to date range
   */
  private parseRelativeTimeToDateRange(relativeTime: string): { start: string; end: string } {
    const today = new Date();
    const normalizedTime = relativeTime.toLowerCase();

    if (normalizedTime.includes('next week')) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const endOfWeek = new Date(nextWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      
      return {
        start: nextWeek.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
      };
    } else if (normalizedTime.includes('this week')) {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (6 - today.getDay()));
      
      return {
        start: today.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
      };
    } else {
      // Default to next 14 days
      const twoWeeks = new Date(today);
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      
      return {
        start: today.toISOString().split('T')[0],
        end: twoWeeks.toISOString().split('T')[0]
      };
    }
  }
}