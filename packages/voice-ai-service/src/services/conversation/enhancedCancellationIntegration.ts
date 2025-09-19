/**
 * Enhanced Cancellation Integration for Story 3.4
 * 
 * Integrates the enhanced cancellation system with the conversation management
 * system, providing natural language handling for complex cancellation scenarios,
 * emergency protocols, and patient-friendly conversation patterns.
 */

import {
  EnhancedCancellationService,
  EnhancedCancellationRequest,
  EnhancedCancellationResponse
} from '@voice-agent/scheduling-service';
import {
  ConversationContext,
  IntentResult,
  ConversationFlowState
} from '@voice-agent/shared-utils';
import { logger } from '@voice-agent/shared-utils';

export class EnhancedCancellationIntegration {
  private cancellationService: EnhancedCancellationService;

  constructor(cancellationService: EnhancedCancellationService) {
    this.cancellationService = cancellationService;
  }

  /**
   * Handle enhanced cancellation conversation flow
   */
  async handleCancellationFlow(
    intent: IntentResult,
    context: ConversationContext
  ): Promise<{ 
    message: string; 
    requiresConfirmation?: boolean;
    flowState?: ConversationFlowState;
    nextAction?: string;
  }> {
    try {
      const { entities, confidence } = intent;

      // Determine cancellation flow state
      const currentState = context.currentFlowState || 'initial_request';

      switch (currentState) {
        case 'initial_request':
          return await this.handleInitialCancellationRequest(entities, context);
        
        case 'appointment_lookup':
          return await this.handleAppointmentLookup(entities, context);
        
        case 'emergency_detection':
          return await this.handleEmergencyDetection(entities, context);
        
        case 'confirmation_preference':
          return await this.handleConfirmationPreference(entities, context);
        
        case 'final_confirmation':
          return await this.handleFinalConfirmation(entities, context);
        
        case 'emergency_processing':
          return await this.handleEmergencyProcessing(entities, context);
        
        default:
          return {
            message: "I'm not sure where we are in the cancellation process. Let me start over. Would you like to cancel an appointment?",
            flowState: 'initial_request'
          };
      }

    } catch (error) {
      logger.error('Enhanced cancellation flow error', { error, intent, context });
      return {
        message: "I'm having trouble with the cancellation process. Let me transfer you to our staff who can help you immediately.",
        nextAction: 'escalate'
      };
    }
  }

  /**
   * Handle initial cancellation request
   */
  private async handleInitialCancellationRequest(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      // Check for emergency indicators in the initial request
      const emergencyKeywords = ['emergency', 'urgent', 'hospital', 'sick', 'accident', 'family emergency'];
      const userMessage = context.lastUserMessage?.toLowerCase() || '';
      const isEmergency = emergencyKeywords.some(keyword => userMessage.includes(keyword));

      if (isEmergency) {
        // Store emergency context and move to emergency detection
        context.metadata = {
          ...context.metadata,
          emergencyDetected: true,
          emergencyIndicators: emergencyKeywords.filter(keyword => userMessage.includes(keyword))
        };

        return {
          message: "I understand this may be an emergency situation. Let me help you cancel your appointment immediately. Can you provide your appointment confirmation number or tell me the date and time of your appointment?",
          flowState: 'emergency_detection',
          requiresConfirmation: false
        };
      }

      // Standard cancellation flow
      const hasConfirmationNumber = entities.confirmation_number || context.verificationSession?.confirmed;
      
      if (hasConfirmationNumber) {
        return {
          message: "I can help you cancel your appointment. Before we proceed, this is an important decision. Are you sure you want to cancel your appointment? Please say yes to confirm or no if you'd like to keep it.",
          flowState: 'appointment_lookup',
          requiresConfirmation: true
        };
      } else {
        return {
          message: "I'd be happy to help you cancel your appointment. To find your appointment, I'll need your confirmation number. Do you have that available?",
          flowState: 'appointment_lookup',
          requiresConfirmation: false
        };
      }

    } catch (error) {
      logger.error('Failed to handle initial cancellation request', { error, entities, context });
      return {
        message: "I'm having trouble starting the cancellation process. Let me transfer you to our staff for assistance.",
        nextAction: 'escalate'
      };
    }
  }

  /**
   * Handle appointment lookup phase
   */
  private async handleAppointmentLookup(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      const confirmationNumber = entities.confirmation_number;
      const isConfirmed = entities.confirmation === 'yes' || entities.confirmation === true;

      if (!confirmationNumber && !context.verificationSession?.confirmed) {
        return {
          message: "I'll need your appointment confirmation number to find your appointment. It usually starts with 'CE' followed by letters and numbers. Can you provide that for me?",
          flowState: 'appointment_lookup',
          requiresConfirmation: false
        };
      }

      if (confirmationNumber) {
        // Store confirmation number for later use
        context.metadata = {
          ...context.metadata,
          confirmationNumber
        };
      }

      if (!isConfirmed) {
        return {
          message: "Before I cancel your appointment, I want to make sure this is what you want to do. Cancelling will make this appointment time available for other patients. Are you sure you want to proceed with the cancellation?",
          flowState: 'appointment_lookup',
          requiresConfirmation: true
        };
      }

      // Move to emergency detection if not already detected
      if (!context.metadata?.emergencyDetected) {
        return {
          message: "I understand you want to cancel your appointment. Is this cancellation due to an emergency or urgent medical situation? This helps me handle your request appropriately.",
          flowState: 'emergency_detection',
          requiresConfirmation: false
        };
      }

      // Skip to confirmation preferences
      return {
        message: "Perfect. I can process your cancellation now. Would you like me to send you a confirmation text message in addition to confirming over the phone?",
        flowState: 'confirmation_preference',
        requiresConfirmation: false
      };

    } catch (error) {
      logger.error('Failed to handle appointment lookup', { error, entities, context });
      return {
        message: "I'm having trouble finding your appointment. Let me transfer you to our staff who can help locate it.",
        nextAction: 'escalate'
      };
    }
  }

  /**
   * Handle emergency detection phase
   */
  private async handleEmergencyDetection(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      const isEmergency = entities.emergency === 'yes' || entities.emergency === true ||
                         entities.urgent === 'yes' || entities.urgent === true;
      const emergencyReason = entities.emergency_reason || entities.reason;

      // Store emergency status
      context.metadata = {
        ...context.metadata,
        isEmergency,
        emergencyReason
      };

      if (isEmergency) {
        return {
          message: "I understand this is an emergency situation. I'll process your cancellation immediately with no cancellation fee. I'll also make sure our staff is notified in case you need any additional assistance. Would you like me to send confirmation via text message as well as voice?",
          flowState: 'emergency_processing',
          requiresConfirmation: false
        };
      } else {
        return {
          message: "Thank you for letting me know. I'll process your standard cancellation. Depending on the timing of your appointment, there may be a cancellation fee. Would you like me to send you a confirmation text message in addition to our phone confirmation?",
          flowState: 'confirmation_preference',
          requiresConfirmation: false
        };
      }

    } catch (error) {
      logger.error('Failed to handle emergency detection', { error, entities, context });
      return {
        message: "I'm having trouble processing your request. For your safety, let me transfer you to our staff immediately.",
        nextAction: 'escalate'
      };
    }
  }

  /**
   * Handle confirmation preference
   */
  private async handleConfirmationPreference(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      const wantsSMS = entities.sms === 'yes' || entities.text === 'yes' || 
                      entities.confirmation === 'yes' || entities.confirmation === true;
      const wantsEmail = entities.email === 'yes';

      // Store confirmation preferences
      const confirmationMethods: ('voice' | 'sms' | 'email')[] = ['voice'];
      if (wantsSMS) confirmationMethods.push('sms');
      if (wantsEmail) confirmationMethods.push('email');

      context.metadata = {
        ...context.metadata,
        confirmationMethods
      };

      return {
        message: "Perfect. Let me process your cancellation now. This will just take a moment.",
        flowState: 'final_confirmation',
        requiresConfirmation: false
      };

    } catch (error) {
      logger.error('Failed to handle confirmation preference', { error, entities, context });
      return {
        message: "I'll process your cancellation with voice confirmation only.",
        flowState: 'final_confirmation',
        requiresConfirmation: false
      };
    }
  }

  /**
   * Handle final confirmation and processing
   */
  private async handleFinalConfirmation(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      // Build enhanced cancellation request
      const request: EnhancedCancellationRequest = {
        appointmentId: context.metadata?.appointmentId || 'temp_lookup_needed',
        patientId: context.patientId || context.verificationSession?.patientId || '',
        reason: context.metadata?.emergencyReason || 'Patient requested cancellation',
        conversationId: context.sessionId,
        emergency: context.metadata?.isEmergency || false,
        emergencyReason: context.metadata?.emergencyReason,
        preferredConfirmationMethods: context.metadata?.confirmationMethods || ['voice']
      };

      // Process the cancellation
      const response = await this.cancellationService.processCancellation(request);

      if (response.success) {
        let message = response.message;

        // Add patient-friendly next steps
        message += " ";
        if (response.emergencyProtocolActivated) {
          message += "Our medical staff has been notified of your emergency cancellation and may contact you to offer assistance. ";
        }
        
        message += "Would you like me to help you schedule a new appointment, or is there anything else I can help you with today?";

        return {
          message,
          flowState: 'completed',
          nextAction: 'offer_rescheduling'
        };
      } else {
        return {
          message: response.message + " Would you like me to transfer you to our staff who can help you directly?",
          flowState: 'error',
          nextAction: 'offer_escalation'
        };
      }

    } catch (error) {
      logger.error('Failed to process final cancellation', { error, entities, context });
      return {
        message: "I'm having trouble completing your cancellation. Let me transfer you to our staff who can help you immediately.",
        nextAction: 'escalate'
      };
    }
  }

  /**
   * Handle emergency processing
   */
  private async handleEmergencyProcessing(
    entities: any,
    context: ConversationContext
  ): Promise<{ message: string; requiresConfirmation?: boolean; flowState?: ConversationFlowState; nextAction?: string; }> {
    try {
      // Immediate emergency processing
      const confirmationMethods: ('voice' | 'sms' | 'email')[] = ['voice'];
      const wantsSMS = entities.sms === 'yes' || entities.text === 'yes' || 
                      entities.confirmation === 'yes' || entities.confirmation === true;
      if (wantsSMS) confirmationMethods.push('sms');

      const request: EnhancedCancellationRequest = {
        appointmentId: context.metadata?.appointmentId || 'temp_lookup_needed',
        patientId: context.patientId || context.verificationSession?.patientId || '',
        reason: `EMERGENCY: ${context.metadata?.emergencyReason || 'Medical emergency'}`,
        conversationId: context.sessionId,
        emergency: true,
        emergencyReason: context.metadata?.emergencyReason || 'Medical emergency',
        preferredConfirmationMethods: confirmationMethods
      };

      const response = await this.cancellationService.processCancellation(request);

      if (response.success) {
        return {
          message: response.message + " Our staff will prioritize any follow-up assistance you may need. Is there anything else I can help you with during this emergency?",
          flowState: 'emergency_completed',
          nextAction: 'offer_emergency_assistance'
        };
      } else {
        return {
          message: "I understand this is an emergency. I'm having trouble with the cancellation system. I'm transferring you immediately to our staff who can help you right away.",
          nextAction: 'emergency_escalate'
        };
      }

    } catch (error) {
      logger.error('Failed to process emergency cancellation', { error, entities, context });
      return {
        message: "This is an emergency situation and I'm having technical difficulties. I'm connecting you to our staff immediately for urgent assistance.",
        nextAction: 'emergency_escalate'
      };
    }
  }

  /**
   * Handle follow-up actions after cancellation
   */
  async handlePostCancellationFlow(
    intent: IntentResult,
    context: ConversationContext
  ): Promise<{ message: string; nextAction?: string; }> {
    try {
      const { entities } = intent;

      if (entities.reschedule === 'yes' || entities.new_appointment === 'yes') {
        return {
          message: "I'd be happy to help you schedule a new appointment. Let me connect you with our scheduling system. What type of appointment would you like to schedule?",
          nextAction: 'start_scheduling'
        };
      }

      if (entities.help === 'yes' || entities.assistance === 'yes') {
        if (context.metadata?.isEmergency) {
          return {
            message: "Given your emergency situation, let me transfer you to our medical staff who can provide immediate assistance.",
            nextAction: 'transfer_medical'
          };
        } else {
          return {
            message: "I'm here to help. What else can I assist you with today? I can help with scheduling new appointments, answering questions about our services, or connecting you with our staff.",
            nextAction: 'general_assistance'
          };
        }
      }

      // Default closing
      return {
        message: "Your appointment has been successfully cancelled. Thank you for calling Capitol Eye Care. Have a great day!",
        nextAction: 'end_conversation'
      };

    } catch (error) {
      logger.error('Failed to handle post-cancellation flow', { error, intent, context });
      return {
        message: "Is there anything else I can help you with today?",
        nextAction: 'general_assistance'
      };
    }
  }

  /**
   * Generate patient-friendly clarification prompts
   */
  generateClarificationPrompt(misunderstoodIntent: string, context: ConversationContext): string {
    const currentState = context.currentFlowState;

    switch (currentState) {
      case 'appointment_lookup':
        return "I want to make sure I understand correctly. Are you saying you'd like to cancel an appointment? Please say 'yes' to cancel or 'no' if you meant something else.";

      case 'emergency_detection':
        return "I want to make sure I understand your situation. Are you saying this cancellation is due to an emergency or urgent medical situation? Please say 'yes' if it's an emergency or 'no' for a regular cancellation.";

      case 'confirmation_preference':
        return "I want to confirm how you'd like to receive your cancellation confirmation. Would you like me to send you a text message confirmation in addition to this phone call? Please say 'yes' for text message or 'no' for phone only.";

      default:
        return "I want to make sure I understand what you need. Are you looking to cancel an appointment today? Please say 'yes' to cancel an appointment or 'no' if you need help with something else.";
    }
  }

  /**
   * Handle conversation timeout with state preservation
   */
  handleTimeout(context: ConversationContext): { message: string; nextAction: string; } {
    const currentState = context.currentFlowState;
    const isEmergency = context.metadata?.isEmergency;

    if (isEmergency) {
      return {
        message: "I understand this is an emergency and you may need immediate assistance. I'm connecting you to our staff right away.",
        nextAction: 'emergency_escalate'
      };
    }

    switch (currentState) {
      case 'final_confirmation':
      case 'emergency_processing':
        return {
          message: "I was in the middle of processing your cancellation. Let me continue with that now, or I can transfer you to our staff to complete the cancellation.",
          nextAction: 'resume_processing'
        };

      default:
        return {
          message: "I want to make sure I help you with your appointment cancellation. Would you like to continue with the cancellation, or should I transfer you to our staff?",
          nextAction: 'offer_continuation'
        };
    }
  }
}