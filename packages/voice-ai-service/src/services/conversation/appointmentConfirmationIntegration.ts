/**
 * Appointment Confirmation and Reminder Integration
 * 
 * Bridges NLU system with appointment confirmation and reminder services
 * for natural language handling of confirmation queries and reminder responses
 */

import { logger } from '@voice-agent/shared-utils';
import { 
  IntentResult, 
  EntityExtractionResult,
  ConversationContext,
  ConversationResponse 
} from '../../types';

export interface ConfirmationIntegrationConfig {
  schedulingServiceUrl: string;
  confirmationTimeout: number; // seconds
  maxRetries: number;
}

export interface ConfirmationLookupRequest {
  confirmationNumber?: string;
  patientId?: string;
  phoneNumber?: string;
  appointmentDate?: string;
}

export interface ConfirmationLookupResponse {
  success: boolean;
  appointment?: any;
  confirmation?: any;
  message: string;
  suggestedActions?: string[];
}

export interface ReminderResponseRequest {
  reminderId?: string;
  patientId?: string;
  responseType: 'confirmed' | 'reschedule_requested' | 'cancel_requested' | 'question';
  responseContent?: string;
}

export interface ReminderResponseResult {
  success: boolean;
  nextAction: string;
  staffNotificationSent: boolean;
  message: string;
}

export class AppointmentConfirmationIntegration {
  private config: ConfirmationIntegrationConfig;

  constructor(config: ConfirmationIntegrationConfig) {
    this.config = config;
  }

  /**
   * Process confirmation lookup intents
   */
  async processConfirmationLookup(
    intentResult: IntentResult,
    entities: EntityExtractionResult,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    
    try {
      logger.info('Processing confirmation lookup', {
        intent: intentResult.intent,
        patientId: context.patientId,
        verified: context.isVerified
      });

      // Ensure patient is verified for confirmation lookup
      if (!context.isVerified) {
        return {
          message: "I'll need to verify your identity first before I can look up your appointment confirmation. Can you please provide your first name?",
          shouldContinue: true,
          nextAction: 'verification_required',
          context: {
            ...context,
            pendingAction: 'confirmation_lookup',
            pendingData: { entities }
          }
        };
      }

      // Extract confirmation lookup criteria
      const lookupRequest = this.extractConfirmationCriteria(entities, context);
      
      // Perform confirmation lookup
      const lookupResult = await this.lookupConfirmation(lookupRequest);
      
      if (!lookupResult.success) {
        return this.handleConfirmationLookupFailure(lookupResult, context);
      }

      // Generate successful lookup response
      return this.generateConfirmationDetails(lookupResult, context);

    } catch (error) {
      logger.error('Failed to process confirmation lookup', { error, intentResult, entities });
      return {
        message: "I'm having trouble looking up your confirmation right now. Let me connect you with our staff who can help you with your appointment details.",
        shouldContinue: false,
        nextAction: 'escalate_to_staff',
        context
      };
    }
  }

  /**
   * Process confirmation number inquiry
   */
  async processConfirmationNumberInquiry(
    intentResult: IntentResult,
    entities: EntityExtractionResult,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    
    try {
      // Check if patient is providing a confirmation number
      const confirmationNumber = entities.entities.find(e => 
        e.type === 'confirmation_number' || e.type === 'reference_number'
      )?.value;

      if (confirmationNumber) {
        // Patient is providing confirmation number - look it up
        const lookupResult = await this.lookupConfirmation({ confirmationNumber });
        
        if (lookupResult.success) {
          return {
            message: `Perfect! I found your appointment. ${lookupResult.message} Is there anything specific about your appointment you'd like to know?`,
            shouldContinue: true,
            nextAction: 'appointment_details_ready',
            context: {
              ...context,
              currentAppointment: lookupResult.appointment,
              currentConfirmation: lookupResult.confirmation
            }
          };
        } else {
          return {
            message: `I couldn't find an appointment with confirmation number ${confirmationNumber}. Could you please double-check the number and try again, or would you like me to look up your appointment using your phone number instead?`,
            shouldContinue: true,
            nextAction: 'retry_confirmation_lookup',
            context
          };
        }
      } else {
        // Patient is asking for their confirmation number
        if (!context.isVerified) {
          return {
            message: "I'll need to verify your identity first before I can provide your confirmation number. Can you please provide your first name?",
            shouldContinue: true,
            nextAction: 'verification_required',
            context: {
              ...context,
              pendingAction: 'provide_confirmation_number'
            }
          };
        }

        // Look up appointments for verified patient
        const lookupResult = await this.lookupConfirmation({ 
          patientId: context.patientId 
        });

        if (lookupResult.success && lookupResult.confirmation) {
          const confirmationNumber = lookupResult.confirmation.confirmationNumber;
          return {
            message: `Your confirmation number is ${this.formatConfirmationNumberForVoice(confirmationNumber)}. I'll repeat that: ${this.formatConfirmationNumberForVoice(confirmationNumber)}. Your appointment is ${lookupResult.message}`,
            shouldContinue: true,
            nextAction: 'confirmation_provided',
            context: {
              ...context,
              currentAppointment: lookupResult.appointment,
              currentConfirmation: lookupResult.confirmation
            }
          };
        } else {
          return {
            message: "I don't see any upcoming appointments with confirmation numbers for you. Would you like me to help you schedule a new appointment instead?",
            shouldContinue: true,
            nextAction: 'offer_new_appointment',
            context
          };
        }
      }

    } catch (error) {
      logger.error('Failed to process confirmation number inquiry', { error, intentResult, entities });
      return {
        message: "I'm having trouble with confirmation numbers right now. Let me connect you with our staff for assistance.",
        shouldContinue: false,
        nextAction: 'escalate_to_staff',
        context
      };
    }
  }

  /**
   * Process appointment details request
   */
  async processAppointmentDetailsRequest(
    intentResult: IntentResult,
    entities: EntityExtractionResult,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    
    try {
      // Use current appointment if available in context
      if (context.currentAppointment && context.currentConfirmation) {
        return this.generateDetailedAppointmentInfo(
          context.currentAppointment, 
          context.currentConfirmation, 
          context
        );
      }

      // Verify patient and lookup appointment
      if (!context.isVerified) {
        return {
          message: "I'll need to verify your identity first before I can share your appointment details. Can you please provide your first name?",
          shouldContinue: true,
          nextAction: 'verification_required',
          context: {
            ...context,
            pendingAction: 'appointment_details_request'
          }
        };
      }

      // Look up patient's appointment
      const lookupResult = await this.lookupConfirmation({ 
        patientId: context.patientId 
      });

      if (lookupResult.success) {
        return this.generateDetailedAppointmentInfo(
          lookupResult.appointment, 
          lookupResult.confirmation, 
          context
        );
      } else {
        return {
          message: "I don't see any upcoming appointments for you in our system. Would you like me to help you schedule a new appointment?",
          shouldContinue: true,
          nextAction: 'offer_new_appointment',
          context
        };
      }

    } catch (error) {
      logger.error('Failed to process appointment details request', { error, intentResult, entities });
      return {
        message: "I'm having trouble accessing your appointment details right now. Let me connect you with our staff.",
        shouldContinue: false,
        nextAction: 'escalate_to_staff',
        context
      };
    }
  }

  /**
   * Process preparation instructions request
   */
  async processPreparationInstructionsRequest(
    intentResult: IntentResult,
    entities: EntityExtractionResult,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    
    try {
      // Get appointment details first
      let appointment = context.currentAppointment;
      
      if (!appointment) {
        if (!context.isVerified) {
          return {
            message: "I'll need to verify your identity first before I can provide preparation instructions. Can you please provide your first name?",
            shouldContinue: true,
            nextAction: 'verification_required',
            context: {
              ...context,
              pendingAction: 'preparation_instructions_request'
            }
          };
        }

        const lookupResult = await this.lookupConfirmation({ 
          patientId: context.patientId 
        });

        if (!lookupResult.success) {
          return {
            message: "I don't see any upcoming appointments for you. Would you like me to help you schedule a new appointment or provide general preparation information?",
            shouldContinue: true,
            nextAction: 'offer_general_preparation_or_new_appointment',
            context
          };
        }
        
        appointment = lookupResult.appointment;
      }

      // Generate preparation instructions based on appointment type
      const instructions = this.generatePreparationInstructions(appointment, context);
      
      return {
        message: instructions,
        shouldContinue: true,
        nextAction: 'preparation_instructions_provided',
        context: {
          ...context,
          currentAppointment: appointment
        }
      };

    } catch (error) {
      logger.error('Failed to process preparation instructions request', { error, intentResult, entities });
      return {
        message: "I'm having trouble accessing preparation instructions right now. Our staff can provide detailed preparation information when I connect you.",
        shouldContinue: false,
        nextAction: 'escalate_to_staff',
        context
      };
    }
  }

  /**
   * Process reminder response from patient
   */
  async processReminderResponse(
    intentResult: IntentResult,
    entities: EntityExtractionResult,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    
    try {
      logger.info('Processing reminder response', {
        intent: intentResult.intent,
        entities: entities.entities,
        reminderId: context.reminderId
      });

      // Determine response type from entities
      const responseType = this.determineReminderResponseType(entities);
      
      // Process the reminder response
      const responseRequest: ReminderResponseRequest = {
        reminderId: context.reminderId,
        patientId: context.patientId,
        responseType,
        responseContent: entities.entities.find(e => e.type === 'message')?.value
      };

      const result = await this.processReminderResponseAction(responseRequest);

      // Generate appropriate response based on action type
      switch (result.nextAction) {
        case 'none':
          return {
            message: "Perfect! I've confirmed your appointment. We look forward to seeing you. Have a great day!",
            shouldContinue: false,
            nextAction: 'conversation_complete',
            context
          };

        case 'transfer_to_scheduling':
          return {
            message: "I understand you'd like to reschedule your appointment. Let me connect you with our scheduling team who can help you find a new time that works better.",
            shouldContinue: false,
            nextAction: 'transfer_to_scheduling',
            context
          };

        case 'transfer_to_cancellation':
          return {
            message: "I understand you need to cancel your appointment. Let me connect you with our staff who can help process the cancellation and discuss any applicable policies.",
            shouldContinue: false,
            nextAction: 'transfer_to_cancellation',
            context
          };

        case 'transfer_to_staff':
          return {
            message: "I understand you have a question about your appointment. Let me connect you with our staff who can provide detailed assistance.",
            shouldContinue: false,
            nextAction: 'transfer_to_staff',
            context
          };

        default:
          return {
            message: "Thank you for your response. I've recorded it and our staff will follow up with you as needed.",
            shouldContinue: false,
            nextAction: 'conversation_complete',
            context
          };
      }

    } catch (error) {
      logger.error('Failed to process reminder response', { error, intentResult, entities });
      return {
        message: "I'm having trouble processing your response right now. Let me connect you with our staff for assistance.",
        shouldContinue: false,
        nextAction: 'escalate_to_staff',
        context
      };
    }
  }

  /**
   * Extract confirmation lookup criteria from entities and context
   */
  private extractConfirmationCriteria(
    entities: EntityExtractionResult, 
    context: ConversationContext
  ): ConfirmationLookupRequest {
    
    const criteria: ConfirmationLookupRequest = {
      patientId: context.patientId
    };

    // Extract confirmation number if provided
    const confirmationNumber = entities.entities.find(e => 
      e.type === 'confirmation_number' || e.type === 'reference_number'
    )?.value;
    
    if (confirmationNumber) {
      criteria.confirmationNumber = confirmationNumber;
    }

    // Extract phone number if provided
    const phoneNumber = entities.entities.find(e => e.type === 'phone_number')?.value;
    if (phoneNumber) {
      criteria.phoneNumber = phoneNumber;
    }

    // Extract appointment date if provided
    const date = entities.entities.find(e => e.type === 'date')?.value;
    if (date) {
      criteria.appointmentDate = date;
    }

    return criteria;
  }

  /**
   * Perform confirmation lookup via scheduling service
   */
  private async lookupConfirmation(request: ConfirmationLookupRequest): Promise<ConfirmationLookupResponse> {
    try {
      // This would make an HTTP call to the scheduling service
      // For now, simulate the response
      
      if (request.confirmationNumber) {
        // Simulate confirmation number lookup
        logger.info('Looking up confirmation by number', { confirmationNumber: request.confirmationNumber });
        
        // Simulate successful lookup
        return {
          success: true,
          appointment: {
            id: 'apt-123',
            datetime: '2025-09-16T14:00:00Z',
            type: 'routine',
            practitionerName: 'Dr. Smith',
            duration: 60
          },
          confirmation: {
            confirmationNumber: request.confirmationNumber,
            deliveryStatus: { voice: { delivered: true } }
          },
          message: `for Monday, September 16th at 2:00 PM with Dr. Smith`
        };
      } else if (request.patientId) {
        // Simulate patient lookup
        logger.info('Looking up confirmation by patient ID', { patientId: request.patientId });
        
        return {
          success: true,
          appointment: {
            id: 'apt-456',
            datetime: '2025-09-18T10:30:00Z',
            type: 'follow-up',
            practitionerName: 'Dr. Johnson',
            duration: 30
          },
          confirmation: {
            confirmationNumber: 'CE23A4B6',
            deliveryStatus: { voice: { delivered: true } }
          },
          message: `for Wednesday, September 18th at 10:30 AM with Dr. Johnson`
        };
      } else {
        return {
          success: false,
          message: "I need either a confirmation number or patient information to look up your appointment."
        };
      }

    } catch (error) {
      logger.error('Failed to lookup confirmation', { error, request });
      return {
        success: false,
        message: "I'm having trouble accessing the appointment system right now."
      };
    }
  }

  /**
   * Handle confirmation lookup failure
   */
  private handleConfirmationLookupFailure(
    lookupResult: ConfirmationLookupResponse, 
    context: ConversationContext
  ): ConversationResponse {
    
    return {
      message: `${lookupResult.message} Would you like to try a different confirmation number, or shall I look up your appointment using your phone number instead?`,
      shouldContinue: true,
      nextAction: 'retry_confirmation_lookup',
      context,
      suggestedActions: lookupResult.suggestedActions
    };
  }

  /**
   * Generate detailed appointment information
   */
  private generateDetailedAppointmentInfo(
    appointment: any, 
    confirmation: any, 
    context: ConversationContext
  ): ConversationResponse {
    
    const date = new Date(appointment.datetime);
    const formattedDate = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    let message = `Your ${appointment.type} appointment is scheduled for ${formattedDate} at ${formattedTime} with ${appointment.practitionerName}. `;
    
    if (confirmation.confirmationNumber) {
      message += `Your confirmation number is ${this.formatConfirmationNumberForVoice(confirmation.confirmationNumber)}. `;
    }
    
    message += `The appointment is expected to take about ${appointment.duration} minutes. Is there anything specific about your appointment you'd like to know?`;

    return {
      message,
      shouldContinue: true,
      nextAction: 'appointment_details_provided',
      context: {
        ...context,
        currentAppointment: appointment,
        currentConfirmation: confirmation
      }
    };
  }

  /**
   * Generate preparation instructions for appointment
   */
  private generatePreparationInstructions(appointment: any, context: ConversationContext): string {
    const elderlyFriendly = context.accessibilityNeeds?.slowSpeech || false;
    
    let instructions = elderlyFriendly ?
      `Here's what you need to know to prepare for your ${appointment.type} appointment. ` :
      `For your ${appointment.type} appointment, please: `;

    switch (appointment.type.toLowerCase()) {
      case 'routine':
        instructions += elderlyFriendly ?
          `Please arrive 15 minutes early to complete your check-in. Bring your insurance card and a current list of all medications you're taking. If you have glasses or contacts, please bring them with you. Your eyes may be dilated during the exam, so please arrange for someone to drive you home as your vision may be blurry for 2 to 4 hours afterward.` :
          `Arrive 15 minutes early. Bring insurance card, medication list, and current glasses. Eyes may be dilated - arrange transportation.`;
        break;

      case 'follow-up':
        instructions += elderlyFriendly ?
          `Please arrive 15 minutes early for check-in. Bring your current glasses and any eye medications you're currently using. If you have questions about your previous visit or treatment, please write them down to discuss with the doctor.` :
          `Arrive 15 minutes early. Bring current glasses and eye medications.`;
        break;

      case 'urgent':
        instructions += elderlyFriendly ?
          `Please do not put any drops in your eyes unless our office has specifically instructed you to do so. If this is a medical emergency, please call 911 immediately. Otherwise, arrive promptly for your urgent appointment and bring your insurance card and medication list.` :
          `Do not use eye drops unless instructed. Call 911 for emergencies. Bring insurance card and medication list.`;
        break;

      default:
        instructions += elderlyFriendly ?
          `Please arrive 15 minutes early to complete check-in and bring your insurance card and current medication list.` :
          `Arrive 15 minutes early. Bring insurance card and medication list.`;
    }

    return instructions;
  }

  /**
   * Determine reminder response type from entities
   */
  private determineReminderResponseType(entities: EntityExtractionResult): 'confirmed' | 'reschedule_requested' | 'cancel_requested' | 'question' {
    const responseText = entities.originalText.toLowerCase();
    
    if (responseText.includes('yes') || responseText.includes('confirm') || responseText.includes('be there')) {
      return 'confirmed';
    } else if (responseText.includes('reschedule') || responseText.includes('change') || responseText.includes('different time')) {
      return 'reschedule_requested';
    } else if (responseText.includes('cancel') || responseText.includes('can\'t make') || responseText.includes('not coming')) {
      return 'cancel_requested';
    } else {
      return 'question';
    }
  }

  /**
   * Process reminder response action via scheduling service
   */
  private async processReminderResponseAction(request: ReminderResponseRequest): Promise<ReminderResponseResult> {
    try {
      // This would make an HTTP call to the scheduling service
      // For now, simulate the response
      
      logger.info('Processing reminder response', { request });
      
      // Simulate different response handling
      switch (request.responseType) {
        case 'confirmed':
          return {
            success: true,
            nextAction: 'none',
            staffNotificationSent: false,
            message: 'Appointment confirmed'
          };
          
        case 'reschedule_requested':
          return {
            success: true,
            nextAction: 'transfer_to_scheduling',
            staffNotificationSent: true,
            message: 'Reschedule request processed'
          };
          
        case 'cancel_requested':
          return {
            success: true,
            nextAction: 'transfer_to_cancellation',
            staffNotificationSent: true,
            message: 'Cancellation request processed'
          };
          
        case 'question':
          return {
            success: true,
            nextAction: 'transfer_to_staff',
            staffNotificationSent: true,
            message: 'Question forwarded to staff'
          };
          
        default:
          return {
            success: false,
            nextAction: 'transfer_to_staff',
            staffNotificationSent: false,
            message: 'Unknown response type'
          };
      }

    } catch (error) {
      logger.error('Failed to process reminder response', { error, request });
      return {
        success: false,
        nextAction: 'transfer_to_staff',
        staffNotificationSent: false,
        message: 'Processing failed'
      };
    }
  }

  /**
   * Format confirmation number for voice pronunciation
   */
  private formatConfirmationNumberForVoice(confirmationNumber: string): string {
    // Break up confirmation number for clear pronunciation
    // Example: "CE23A4B6" becomes "C-E-2-3-A-4-B-6"
    return confirmationNumber.split('').join('-');
  }
}