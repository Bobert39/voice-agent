/**
 * Cancellation Confirmation Service for Story 3.4
 * 
 * Handles enhanced confirmation process with reference numbers, multiple delivery methods,
 * and comprehensive confirmation tracking. Provides patient-friendly confirmation patterns
 * with clear pronunciation and repetition options.
 */

import { Redis } from 'ioredis';
import { 
  CancellationConfirmation, 
  AppointmentDetails,
  EnhancedCancellationRequest,
  EnhancedCancellationResponse 
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class CancellationConfirmationService {
  private redis: Redis;
  private notificationService: any; // TODO: Type this when notification service is available

  constructor(redis: Redis, notificationService: any) {
    this.redis = redis;
    this.notificationService = notificationService;
  }

  /**
   * Generate and store cancellation confirmation with reference number
   */
  async createCancellationConfirmation(
    appointment: AppointmentDetails,
    request: EnhancedCancellationRequest,
    cancellationFee?: number
  ): Promise<CancellationConfirmation> {
    try {
      const referenceNumber = this.generateCancellationReferenceNumber();
      
      const confirmation: CancellationConfirmation = {
        referenceNumber,
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        cancellationDateTime: new Date().toISOString(),
        originalAppointment: appointment,
        cancellationFee,
        reason: request.reason,
        deliveryMethods: {
          voice: {
            delivered: false,
            confirmed: false
          }
        },
        waitlistNotified: false,
        waitlistNotificationCount: 0
      };

      // Store confirmation with 7-year retention for HIPAA compliance
      await this.storeCancellationConfirmation(confirmation);

      // Add to reference number index for quick lookup
      await this.redis.setex(
        `cancellation:ref:${referenceNumber}`,
        86400 * 365 * 7, // 7 years
        confirmation.appointmentId
      );

      logger.info('Cancellation confirmation created', {
        referenceNumber,
        appointmentId: appointment.id,
        patientId: appointment.patientId
      });

      return confirmation;

    } catch (error) {
      logger.error('Failed to create cancellation confirmation', { error, appointment, request });
      throw new Error('Failed to create cancellation confirmation');
    }
  }

  /**
   * Deliver confirmation via multiple methods based on request preferences
   */
  async deliverConfirmation(
    confirmation: CancellationConfirmation,
    request: EnhancedCancellationRequest
  ): Promise<EnhancedCancellationResponse> {
    try {
      const deliveryResults: EnhancedCancellationResponse['confirmationDelivery'] = {
        voice: false,
        sms: false,
        email: false
      };

      // Always deliver via voice first (primary channel)
      const voiceDelivery = await this.deliverVoiceConfirmation(confirmation);
      deliveryResults.voice = voiceDelivery.success;
      
      if (voiceDelivery.success) {
        confirmation.deliveryMethods.voice.delivered = true;
        confirmation.deliveryMethods.voice.deliveredAt = new Date().toISOString();
        confirmation.deliveryMethods.voice.confirmed = voiceDelivery.confirmed;
      }

      // Deliver via additional methods if requested
      if (request.preferredConfirmationMethods?.includes('sms')) {
        const smsDelivery = await this.deliverSMSConfirmation(confirmation);
        deliveryResults.sms = smsDelivery.success;
        
        if (smsDelivery.success) {
          confirmation.deliveryMethods.sms = {
            delivered: true,
            deliveredAt: new Date().toISOString(),
            phoneNumber: smsDelivery.phoneNumber
          };
        }
      }

      if (request.preferredConfirmationMethods?.includes('email')) {
        const emailDelivery = await this.deliverEmailConfirmation(confirmation);
        deliveryResults.email = emailDelivery.success;
        
        if (emailDelivery.success) {
          confirmation.deliveryMethods.email = {
            delivered: true,
            deliveredAt: new Date().toISOString(),
            emailAddress: emailDelivery.emailAddress
          };
        }
      }

      // Update stored confirmation
      await this.storeCancellationConfirmation(confirmation);

      // Generate confirmation message with patient-friendly pattern
      const message = this.generateConfirmationMessage(confirmation, deliveryResults);

      return {
        success: true,
        message,
        referenceNumber: confirmation.referenceNumber,
        cancellationFee: confirmation.cancellationFee,
        confirmationDelivery: deliveryResults
      };

    } catch (error) {
      logger.error('Failed to deliver cancellation confirmation', { error, confirmation, request });
      return {
        success: false,
        message: "I've cancelled your appointment, but I'm having trouble sending the confirmation. Please write down this reference number: " + confirmation.referenceNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Deliver voice confirmation with patient-friendly patterns
   */
  private async deliverVoiceConfirmation(
    confirmation: CancellationConfirmation
  ): Promise<{ success: boolean; confirmed: boolean }> {
    try {
      const appointment = confirmation.originalAppointment;
      const formattedDate = this.formatAppointmentDateForSpeech(appointment.datetime);
      
      // Generate patient-friendly voice message
      const voiceMessage = this.generateVoiceConfirmationMessage(confirmation, formattedDate);
      
      // TODO: Integrate with ElevenLabs TTS service
      // For now, we'll simulate the delivery
      logger.info('Delivering voice confirmation', {
        referenceNumber: confirmation.referenceNumber,
        patientId: confirmation.patientId,
        messageLength: voiceMessage.length
      });

      // Simulate successful delivery and confirmation
      return { success: true, confirmed: true };

    } catch (error) {
      logger.error('Failed to deliver voice confirmation', { error, confirmation });
      return { success: false, confirmed: false };
    }
  }

  /**
   * Deliver SMS confirmation if phone number available
   */
  private async deliverSMSConfirmation(
    confirmation: CancellationConfirmation
  ): Promise<{ success: boolean; phoneNumber: string }> {
    try {
      // TODO: Get patient phone number from verification service or OpenEMR
      const phoneNumber = "555-123-4567"; // Placeholder
      
      const smsMessage = this.generateSMSConfirmationMessage(confirmation);
      
      // TODO: Integrate with Twilio SMS service
      logger.info('Delivering SMS confirmation', {
        referenceNumber: confirmation.referenceNumber,
        phoneNumber: phoneNumber.substring(0, 8) + 'XXX' // Masked for logging
      });

      return { success: true, phoneNumber };

    } catch (error) {
      logger.error('Failed to deliver SMS confirmation', { error, confirmation });
      return { success: false, phoneNumber: '' };
    }
  }

  /**
   * Deliver email confirmation if email address available
   */
  private async deliverEmailConfirmation(
    confirmation: CancellationConfirmation
  ): Promise<{ success: boolean; emailAddress: string }> {
    try {
      // TODO: Get patient email from verification service or OpenEMR
      const emailAddress = "patient@example.com"; // Placeholder
      
      const emailContent = this.generateEmailConfirmationContent(confirmation);
      
      // TODO: Integrate with email service (SendGrid/SES)
      logger.info('Delivering email confirmation', {
        referenceNumber: confirmation.referenceNumber,
        emailAddress: emailAddress.replace(/(.{2}).*@/, '$1***@') // Masked for logging
      });

      return { success: true, emailAddress };

    } catch (error) {
      logger.error('Failed to deliver email confirmation', { error, confirmation });
      return { success: false, emailAddress: '' };
    }
  }

  /**
   * Generate patient-friendly voice confirmation message
   */
  private generateVoiceConfirmationMessage(
    confirmation: CancellationConfirmation,
    formattedDate: string
  ): string {
    const appointment = confirmation.originalAppointment;
    const referenceSpelling = this.spellReferenceNumber(confirmation.referenceNumber);
    
    let message = `Your ${appointment.type} appointment with ${appointment.practitionerName} `;
    message += `on ${formattedDate} has been successfully cancelled. `;
    
    if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
      message += `There is a $${confirmation.cancellationFee} cancellation fee for this appointment. `;
    }
    
    message += `Your cancellation reference number is ${referenceSpelling}. `;
    message += `Let me repeat that reference number: ${referenceSpelling}. `;
    message += `Please write this down for your records. `;
    message += `The appointment time is now available for other patients. `;
    message += `If you need to schedule a new appointment, please call us or use our online booking system. `;
    message += `Is there anything else I can help you with today?`;
    
    return message;
  }

  /**
   * Generate SMS confirmation message
   */
  private generateSMSConfirmationMessage(confirmation: CancellationConfirmation): string {
    const appointment = confirmation.originalAppointment;
    const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    let message = `Capitol Eye Care: Your ${appointment.type} appointment on ${formattedDate} `;
    message += `has been cancelled. Reference: ${confirmation.referenceNumber}`;
    
    if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
      message += ` (Fee: $${confirmation.cancellationFee})`;
    }
    
    message += `. To reschedule, call (555) 123-4567.`;
    
    return message;
  }

  /**
   * Generate email confirmation content
   */
  private generateEmailConfirmationContent(confirmation: CancellationConfirmation): {
    subject: string;
    htmlBody: string;
    textBody: string;
  } {
    const appointment = confirmation.originalAppointment;
    const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const subject = `Appointment Cancellation Confirmation - ${confirmation.referenceNumber}`;
    
    const textBody = `
Dear ${appointment.patientName},

This confirms that your appointment has been cancelled:

Appointment Details:
- Type: ${appointment.type.charAt(0).toUpperCase() + appointment.type.slice(1)} appointment
- Provider: ${appointment.practitionerName}
- Date & Time: ${formattedDate}
- Cancellation Reference: ${confirmation.referenceNumber}

${confirmation.cancellationFee && confirmation.cancellationFee > 0 ? 
  `Cancellation Fee: $${confirmation.cancellationFee} (due to short notice)\n\n` : ''}

The appointment time is now available for other patients. If you need to schedule a new appointment, please:
- Call us at (555) 123-4567
- Visit our website at www.capitoleyecare.com
- Use our online booking portal

Thank you for choosing Capitol Eye Care.

Best regards,
Capitol Eye Care Team
    `.trim();

    const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2c5282;">Appointment Cancellation Confirmation</h2>
  
  <p>Dear ${appointment.patientName},</p>
  
  <p>This confirms that your appointment has been cancelled:</p>
  
  <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0; color: #2d3748;">Appointment Details</h3>
    <p><strong>Type:</strong> ${appointment.type.charAt(0).toUpperCase() + appointment.type.slice(1)} appointment</p>
    <p><strong>Provider:</strong> ${appointment.practitionerName}</p>
    <p><strong>Date & Time:</strong> ${formattedDate}</p>
    <p><strong>Cancellation Reference:</strong> <span style="font-family: monospace; background-color: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${confirmation.referenceNumber}</span></p>
    ${confirmation.cancellationFee && confirmation.cancellationFee > 0 ? 
      `<p><strong>Cancellation Fee:</strong> $${confirmation.cancellationFee} (due to short notice)</p>` : ''}
  </div>
  
  <p>The appointment time is now available for other patients. If you need to schedule a new appointment, please:</p>
  
  <ul>
    <li>Call us at <strong>(555) 123-4567</strong></li>
    <li>Visit our website at <a href="http://www.capitoleyecare.com">www.capitoleyecare.com</a></li>
    <li>Use our online booking portal</li>
  </ul>
  
  <p>Thank you for choosing Capitol Eye Care.</p>
  
  <p style="margin-top: 30px;">Best regards,<br>Capitol Eye Care Team</p>
</div>
    `.trim();

    return { subject, htmlBody, textBody };
  }

  /**
   * Generate confirmation message for voice response
   */
  private generateConfirmationMessage(
    confirmation: CancellationConfirmation,
    deliveryResults: EnhancedCancellationResponse['confirmationDelivery']
  ): string {
    const appointment = confirmation.originalAppointment;
    const formattedDate = this.formatAppointmentDate(appointment.datetime);
    
    let message = `Perfect! I've successfully cancelled your ${appointment.type} appointment `;
    message += `with ${appointment.practitionerName} on ${formattedDate}. `;
    
    if (confirmation.cancellationFee && confirmation.cancellationFee > 0) {
      message += `There is a $${confirmation.cancellationFee} cancellation fee for this appointment. `;
    }
    
    message += `Your cancellation reference number is ${confirmation.referenceNumber}. `;
    message += `I'll repeat that slowly: ${this.spellReferenceNumber(confirmation.referenceNumber)}. `;
    
    // Mention additional confirmation methods
    const additionalMethods: string[] = [];
    if (deliveryResults.sms) additionalMethods.push('text message');
    if (deliveryResults.email) additionalMethods.push('email');
    
    if (additionalMethods.length > 0) {
      message += `I've also sent you a confirmation ${additionalMethods.join(' and ')}. `;
    }
    
    message += `The appointment time is now available for other patients. `;
    message += `Would you like me to help you schedule a new appointment, or is there anything else I can help you with?`;
    
    return message;
  }

  /**
   * Spell reference number clearly for patients
   */
  private spellReferenceNumber(referenceNumber: string): string {
    return referenceNumber
      .split('')
      .map(char => {
        if (char >= '0' && char <= '9') {
          return char;
        }
        return char.toUpperCase();
      })
      .join(' ');
  }

  /**
   * Format appointment date for speech synthesis
   */
  private formatAppointmentDateForSpeech(datetime: string): string {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Format appointment date for display
   */
  private formatAppointmentDate(datetime: string): string {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Generate unique cancellation reference number
   */
  private generateCancellationReferenceNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CC${timestamp}${random}`;
  }

  /**
   * Store cancellation confirmation with HIPAA-compliant retention
   */
  private async storeCancellationConfirmation(confirmation: CancellationConfirmation): Promise<void> {
    try {
      const key = `cancellation:confirmation:${confirmation.referenceNumber}`;
      await this.redis.setex(
        key,
        86400 * 365 * 7, // 7 years for HIPAA compliance
        JSON.stringify(confirmation)
      );
      
      // Also store by appointment ID for quick lookup
      const appointmentKey = `cancellation:appointment:${confirmation.appointmentId}`;
      await this.redis.setex(
        appointmentKey,
        86400 * 365 * 7,
        confirmation.referenceNumber
      );
      
    } catch (error) {
      logger.error('Failed to store cancellation confirmation', { error, confirmation });
      throw error;
    }
  }

  /**
   * Retrieve cancellation confirmation by reference number
   */
  async getCancellationConfirmation(referenceNumber: string): Promise<CancellationConfirmation | null> {
    try {
      const key = `cancellation:confirmation:${referenceNumber}`;
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get cancellation confirmation', { error, referenceNumber });
      return null;
    }
  }

  /**
   * Update waitlist notification status in confirmation
   */
  async updateWaitlistNotificationStatus(
    referenceNumber: string,
    notified: boolean,
    notificationCount: number
  ): Promise<void> {
    try {
      const confirmation = await this.getCancellationConfirmation(referenceNumber);
      if (confirmation) {
        confirmation.waitlistNotified = notified;
        confirmation.waitlistNotificationCount = notificationCount;
        await this.storeCancellationConfirmation(confirmation);
      }
    } catch (error) {
      logger.error('Failed to update waitlist notification status', { 
        error, 
        referenceNumber, 
        notified, 
        notificationCount 
      });
    }
  }
}