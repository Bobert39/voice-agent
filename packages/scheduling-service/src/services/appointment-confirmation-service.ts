/**
 * Appointment Confirmation Service
 * 
 * Handles immediate appointment confirmation delivery with multi-channel support,
 * preparation instructions, and patient-friendly optimizations
 */

import { Redis } from 'ioredis';
import { logger } from '@voice-agent/shared-utils';
import {
  AppointmentConfirmationRequest,
  AppointmentConfirmationResponse,
  ConfirmationDeliveryStatus,
  PreparationInstruction,
  ConfirmationTemplate,
  ConfirmationNumberConfig,
  AppointmentDetails,
  PatientCommunicationPreferences,
  ConfirmationFailure,
  AppointmentSummary,
  PracticeLocation
} from '../types';

export class AppointmentConfirmationService {
  private redis: Redis;
  private confirmationConfig: ConfirmationNumberConfig;
  private practiceLocation: PracticeLocation;
  private templates: Map<string, ConfirmationTemplate>;

  constructor(
    redis: Redis,
    confirmationConfig: ConfirmationNumberConfig,
    practiceLocation: PracticeLocation
  ) {
    this.redis = redis;
    this.confirmationConfig = confirmationConfig;
    this.practiceLocation = practiceLocation;
    this.templates = new Map();
    
    this.initializeTemplates();
  }

  /**
   * Send immediate appointment confirmation across multiple channels
   */
  async sendConfirmation(request: AppointmentConfirmationRequest): Promise<AppointmentConfirmationResponse> {
    const startTime = Date.now();
    
    try {
      // Generate unique confirmation number
      const confirmationNumber = await this.generateConfirmationNumber();
      
      // Get appointment details
      const appointmentDetails = await this.getAppointmentDetails(request.appointmentId);
      if (!appointmentDetails) {
        throw new Error('Appointment not found');
      }

      // Get patient communication preferences
      const patientPrefs = await this.getPatientPreferences(request.patientId);
      
      // Determine delivery methods based on preferences and request
      const deliveryMethods = this.determineDeliveryMethods(request.preferredMethods, patientPrefs);
      
      // Prepare appointment summary
      const appointmentSummary = this.createAppointmentSummary(appointmentDetails, confirmationNumber);
      
      // Get preparation instructions if requested
      let preparationInstructions: PreparationInstruction[] = [];
      if (request.includePreparationInstructions) {
        preparationInstructions = await this.getPreparationInstructions(
          appointmentDetails.type,
          patientPrefs?.accessibilityNeeds
        );
      }

      // Initialize delivery status
      const deliveryStatus: any = {};
      
      // Send confirmations via each method
      for (const method of deliveryMethods) {
        deliveryStatus[method] = await this.deliverConfirmation(
          method,
          request,
          appointmentSummary,
          preparationInstructions,
          patientPrefs
        );
      }

      // Store confirmation record
      await this.storeConfirmationRecord({
        confirmationNumber,
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        deliveryStatus,
        preparationInstructions,
        timestamp: new Date().toISOString()
      });

      // Generate confirmation message
      const message = this.generateConfirmationMessage(
        appointmentSummary,
        request.patientName,
        confirmationNumber,
        deliveryStatus
      );

      // Log analytics
      await this.logConfirmationAnalytics({
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        deliveryMethods,
        deliveryStatus,
        responseTime: Date.now() - startTime,
        success: true
      });

      return {
        success: true,
        confirmationNumber,
        message,
        deliveryStatus,
        preparationInstructions: preparationInstructions.length > 0 ? preparationInstructions : undefined
      };

    } catch (error) {
      logger.error('Failed to send appointment confirmation', { error, request });
      
      // Log failure analytics
      await this.logConfirmationAnalytics({
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        deliveryMethods: request.preferredMethods,
        deliveryStatus: {},
        responseTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        confirmationNumber: '',
        message: "I'm sorry, there was an issue sending your appointment confirmation. Our staff will contact you shortly with your appointment details.",
        deliveryStatus: {
          voice: {
            attempted: false,
            delivered: false,
            retryCount: 0,
            failureReason: error instanceof Error ? error.message : 'Unknown error'
          }
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Lookup confirmation details by confirmation number
   */
  async lookupConfirmation(confirmationNumber: string): Promise<any> {
    try {
      const key = `confirmation:${confirmationNumber}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return {
          success: false,
          message: "I couldn't find a confirmation with that number. Please check the number and try again."
        };
      }

      const confirmation = JSON.parse(data);
      const appointment = await this.getAppointmentDetails(confirmation.appointmentId);
      
      if (!appointment) {
        return {
          success: false,
          message: "I found the confirmation number but couldn't retrieve the appointment details. Please contact our office."
        };
      }

      return {
        success: true,
        appointment,
        confirmation,
        message: `I found your appointment for ${this.formatAppointmentDateTime(appointment.datetime)} with ${appointment.practitionerName}.`
      };

    } catch (error) {
      logger.error('Failed to lookup confirmation', { error, confirmationNumber });
      return {
        success: false,
        message: "I'm having trouble looking up that confirmation number. Please try again or contact our office."
      };
    }
  }

  /**
   * Generate voice-optimized confirmation number
   */
  private async generateConfirmationNumber(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const number = this.createConfirmationNumber();
      
      // Check for collisions if enabled
      if (this.confirmationConfig.collisionCheckEnabled) {
        const exists = await this.redis.exists(`confirmation:${number}`);
        if (exists) {
          attempts++;
          continue;
        }
      }

      return number;
    }

    throw new Error('Unable to generate unique confirmation number');
  }

  /**
   * Create confirmation number with voice optimization
   */
  private createConfirmationNumber(): string {
    const { prefix, length, includeTimestamp, voiceOptimized } = this.confirmationConfig;
    
    let number = prefix;
    
    if (includeTimestamp) {
      // Use shorter timestamp for voice optimization
      const timestamp = Date.now().toString(36);
      number += timestamp.substring(timestamp.length - 4);
    }

    // Generate remaining characters
    const remainingLength = length - number.length;
    
    if (voiceOptimized) {
      // Use voice-friendly characters (avoid confusing letters/numbers)
      const voiceFriendly = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes 0,1,I,O
      for (let i = 0; i < remainingLength; i++) {
        number += voiceFriendly.charAt(Math.floor(Math.random() * voiceFriendly.length));
      }
    } else {
      // Use standard alphanumeric
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (let i = 0; i < remainingLength; i++) {
        number += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    return number;
  }

  /**
   * Deliver confirmation via specific method
   */
  private async deliverConfirmation(
    method: 'voice' | 'sms' | 'email',
    request: AppointmentConfirmationRequest,
    appointmentSummary: AppointmentSummary,
    preparationInstructions: PreparationInstruction[],
    patientPrefs?: PatientCommunicationPreferences
  ): Promise<ConfirmationDeliveryStatus> {
    
    const startTime = Date.now();
    const status: ConfirmationDeliveryStatus = {
      attempted: true,
      delivered: false,
      retryCount: 0
    };

    try {
      // Get appropriate template
      const template = this.getTemplate(appointmentSummary.type as any, method);
      
      // Generate content
      const content = this.generateConfirmationContent(
        template,
        request,
        appointmentSummary,
        preparationInstructions,
        patientPrefs
      );

      // Deliver based on method
      switch (method) {
        case 'voice':
          status.delivered = await this.deliverVoiceConfirmation(content, request, patientPrefs);
          status.pronunciationOptimized = true;
          break;
          
        case 'sms':
          status.delivered = await this.deliverSMSConfirmation(content, request.contactInfo.phoneNumber);
          break;
          
        case 'email':
          if (request.contactInfo.email) {
            status.delivered = await this.deliverEmailConfirmation(content, request.contactInfo.email);
          } else {
            status.failureReason = 'No email address provided';
          }
          break;
      }

      if (status.delivered) {
        status.deliveredAt = new Date().toISOString();
      }

    } catch (error) {
      status.failureReason = error instanceof Error ? error.message : 'Unknown delivery error';
      logger.error(`Failed to deliver ${method} confirmation`, { error, request });
    }

    return status;
  }

  /**
   * Deliver voice confirmation with patient-friendly optimizations
   */
  private async deliverVoiceConfirmation(
    content: any,
    request: AppointmentConfirmationRequest,
    patientPrefs?: PatientCommunicationPreferences
  ): Promise<boolean> {
    // In a real implementation, this would integrate with the voice service
    // For now, we'll simulate immediate voice confirmation during the call
    
    logger.info('Voice confirmation delivered immediately during call', {
      appointmentId: request.appointmentId,
      patientId: request.patientId,
    });

    return true; // Assume immediate voice confirmation succeeds
  }

  /**
   * Deliver SMS confirmation
   */
  private async deliverSMSConfirmation(content: any, phoneNumber: string): Promise<boolean> {
    // In a real implementation, this would integrate with SMS service (Twilio, etc.)
    
    logger.info('SMS confirmation would be sent', {
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, '*'), // Mask phone number in logs
      contentLength: content.message.length
    });

    // Simulate SMS delivery
    return Math.random() > 0.05; // 95% success rate simulation
  }

  /**
   * Deliver email confirmation
   */
  private async deliverEmailConfirmation(content: any, email: string): Promise<boolean> {
    // In a real implementation, this would integrate with email service
    
    logger.info('Email confirmation would be sent', {
      email: email.replace(/(.{2}).*(@.*)/, '$1***$2'), // Mask email in logs
      subject: content.subject
    });

    // Simulate email delivery
    return Math.random() > 0.03; // 97% success rate simulation
  }

  /**
   * Get appointment details from Redis or OpenEMR
   */
  private async getAppointmentDetails(appointmentId: string): Promise<AppointmentDetails | null> {
    const key = `appointment:${appointmentId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get patient communication preferences
   */
  private async getPatientPreferences(patientId: string): Promise<PatientCommunicationPreferences | undefined> {
    const key = `patient:prefs:${patientId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : undefined;
  }

  /**
   * Determine optimal delivery methods
   */
  private determineDeliveryMethods(
    requestedMethods: ('voice' | 'sms' | 'email')[],
    patientPrefs?: PatientCommunicationPreferences
  ): ('voice' | 'sms' | 'email')[] {
    
    // Always include voice as it's immediate during the call
    const methods: ('voice' | 'sms' | 'email')[] = ['voice'];
    
    // Add other requested methods that aren't opted out
    for (const method of requestedMethods) {
      if (method !== 'voice' && !methods.includes(method)) {
        // Check if patient has opted out
        if (patientPrefs?.optOutStatus?.confirmations) {
          continue;
        }
        
        methods.push(method);
      }
    }

    return methods;
  }

  /**
   * Create appointment summary for confirmation
   */
  private createAppointmentSummary(
    appointment: AppointmentDetails,
    confirmationNumber: string
  ): AppointmentSummary {
    const appointmentDate = new Date(appointment.datetime);
    
    return {
      date: appointmentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: appointmentDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      }),
      provider: appointment.practitionerName,
      type: appointment.type,
      duration: appointment.duration,
      location: this.practiceLocation,
      confirmationNumber
    };
  }

  /**
   * Get preparation instructions for appointment type
   */
  private async getPreparationInstructions(
    appointmentType: string,
    accessibilityNeeds?: any
  ): Promise<PreparationInstruction[]> {
    
    const instructions: PreparationInstruction[] = [];

    // Base instructions for all appointments
    instructions.push({
      type: 'arrival_time',
      title: 'Arrival Time',
      description: true 
        ? 'Please arrive 15 minutes early to complete check-in forms.'
        : 'Arrive 15 minutes early for check-in.',
      mandatory: true,
    });

    // Type-specific instructions
    switch (appointmentType.toLowerCase()) {
      case 'routine':
        instructions.push({
          type: 'documents',
          title: 'What to Bring',
          description: true
            ? 'Please bring your insurance card, current list of medications, and previous glasses if you have them.'
            : 'Bring insurance card, medication list, and current glasses.',
          mandatory: true,
            });
        
        instructions.push({
          type: 'special_requirements',
          title: 'Eye Dilation',
          description: true
            ? 'Your eyes may be dilated during this exam. Please arrange for someone to drive you home, as your vision may be blurry for 2-4 hours.'
            : 'Eyes may be dilated. Arrange transportation as vision may be blurry for 2-4 hours.',
          mandatory: false,
            });
        break;

      case 'follow-up':
        instructions.push({
          type: 'documents',
          title: 'What to Bring',
          description: true
            ? 'Please bring your current glasses and any medications you are taking for your eyes.'
            : 'Bring current glasses and eye medications.',
          mandatory: true,
            });
        break;

      case 'urgent':
        instructions.push({
          type: 'special_requirements',
          title: 'Urgent Care Instructions',
          description: true
            ? 'For urgent eye care, please do not put any drops in your eyes unless instructed by our office. If this is an emergency, please call 911.'
            : 'Do not use eye drops unless instructed. Call 911 for emergencies.',
          mandatory: true,
            });
        break;
    }

    return instructions;
  }

  /**
   * Generate confirmation message for voice response
   */
  private generateConfirmationMessage(
    appointment: AppointmentSummary,
    patientName: string,
    confirmationNumber: string,
    deliveryStatus: any
  ): string {
    
    let message = `Perfect! I've confirmed your ${appointment.type} appointment for ${appointment.date} at ${appointment.time} with ${appointment.provider}. `;
    
    message += `Your confirmation number is ${this.formatConfirmationNumberForVoice(confirmationNumber)}. `;
    
    // Add delivery status information
    const deliveredMethods = Object.entries(deliveryStatus)
      .filter(([_, status]: [string, any]) => status.delivered)
      .map(([method]) => method);

    if (deliveredMethods.length > 1) {
      message += `I've also sent this information to your ${deliveredMethods.slice(1).join(' and ')}. `;
    }

    message += `Please arrive 15 minutes early for check-in. Is there anything else I can help you with today?`;
    
    return message;
  }

  /**
   * Format confirmation number for clear voice pronunciation
   */
  private formatConfirmationNumberForVoice(confirmationNumber: string): string {
    // Break up confirmation number for clear pronunciation
    // Example: "CE23A4B6" becomes "C-E-2-3-A-4-B-6"
    return confirmationNumber.split('').join('-');
  }

  /**
   * Initialize confirmation templates
   */
  private initializeTemplates(): void {
    // Voice template for routine appointments
    this.templates.set('routine-voice', {
      id: 'routine-voice',
      name: 'Routine Appointment Voice Confirmation',
      appointmentType: 'routine',
      deliveryMethod: 'voice',
      content: {
        greeting: 'Your appointment has been confirmed.',
        appointmentDetails: 'You have a {appointmentType} appointment on {date} at {time} with {provider}.',
        preparationInstructions: 'Please remember to {instructions}.',
        contactInfo: 'If you need to make changes, please call our office.',
        closing: 'We look forward to seeing you.'
      },
      patientOptimizations: {
        slowerPace: true,
        simplifiedLanguage: true,
        repetitionEnabled: true,
        clearPronunciation: true
      },
      variables: ['appointmentType', 'date', 'time', 'provider', 'instructions']
    });

    // Add more templates as needed...
  }

  /**
   * Get template for appointment type and delivery method
   */
  private getTemplate(appointmentType: 'routine' | 'follow-up' | 'urgent', method: string): ConfirmationTemplate {
    const templateKey = `${appointmentType}-${method}`;
    return this.templates.get(templateKey) || this.templates.get('routine-voice')!;
  }

  /**
   * Generate confirmation content from template
   */
  private generateConfirmationContent(
    template: ConfirmationTemplate,
    request: AppointmentConfirmationRequest,
    appointmentSummary: AppointmentSummary,
    preparationInstructions: PreparationInstruction[],
    patientPrefs?: PatientCommunicationPreferences
  ): any {
    
    const variables = {
      patientName: request.patientName,
      appointmentType: appointmentSummary.type,
      date: appointmentSummary.date,
      time: appointmentSummary.time,
      provider: appointmentSummary.provider,
      confirmationNumber: appointmentSummary.confirmationNumber,
      instructions: preparationInstructions.map(i => i.description).join('; ')
    };

    const content = {
      subject: template.content.subject,
      message: this.replaceVariables(template.content.greeting, variables) + ' ' +
               this.replaceVariables(template.content.appointmentDetails, variables)
    };

    if (preparationInstructions.length > 0) {
      content.message += ' ' + this.replaceVariables(template.content.preparationInstructions, variables);
    }

    content.message += ' ' + template.content.contactInfo + ' ' + template.content.closing;

    return content;
  }

  /**
   * Replace variables in template content
   */
  private replaceVariables(content: string, variables: Record<string, string>): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return result;
  }

  /**
   * Store confirmation record
   */
  private async storeConfirmationRecord(record: any): Promise<void> {
    const key = `confirmation:${record.confirmationNumber}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(record)); // Store for 30 days
  }

  /**
   * Log confirmation analytics
   */
  private async logConfirmationAnalytics(data: any): Promise<void> {
    const analyticsKey = 'analytics:confirmations';
    const analyticsData = {
      timestamp: new Date().toISOString(),
      ...data
    };
    
    await this.redis.lpush(analyticsKey, JSON.stringify(analyticsData));
    await this.redis.ltrim(analyticsKey, 0, 999); // Keep last 1000 records
  }

  /**
   * Format appointment date and time for voice
   */
  private formatAppointmentDateTime(datetime: string): string {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    }) + ' at ' + date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
}