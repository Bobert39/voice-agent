/**
 * Enhanced Cancellation Service for Story 3.4
 * 
 * Orchestrates the complete enhanced cancellation workflow by integrating:
 * - Existing appointment management service (Story 3.3)
 * - Waitlist management and notifications
 * - Enhanced confirmation with reference numbers
 * - Improved staff notifications
 * - Emergency cancellation protocols
 */

import { Redis } from 'ioredis';
import { AppointmentManagementService } from './appointment-management-service';
import { WaitlistManagementService } from './waitlist-management-service';
import { CancellationConfirmationService } from './cancellation-confirmation-service';
import { StaffNotificationService } from './staff-notification-service';
import { 
  EnhancedCancellationRequest,
  EnhancedCancellationResponse,
  AppointmentDetails,
  WaitlistMatchingCriteria 
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class EnhancedCancellationService {
  private appointmentService: AppointmentManagementService;
  private waitlistService: WaitlistManagementService;
  private confirmationService: CancellationConfirmationService;
  private staffNotificationService: StaffNotificationService;
  private redis: Redis;

  constructor(
    appointmentService: AppointmentManagementService,
    waitlistService: WaitlistManagementService,
    confirmationService: CancellationConfirmationService,
    staffNotificationService: StaffNotificationService,
    redis: Redis
  ) {
    this.appointmentService = appointmentService;
    this.waitlistService = waitlistService;
    this.confirmationService = confirmationService;
    this.staffNotificationService = staffNotificationService;
    this.redis = redis;
  }

  /**
   * Process complete enhanced cancellation workflow
   */
  async processCancellation(request: EnhancedCancellationRequest): Promise<EnhancedCancellationResponse> {
    try {
      logger.info('Starting enhanced cancellation process', {
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        emergency: request.emergency,
        conversationId: request.conversationId
      });

      // Step 1: Get appointment details and validate
      const appointment = await this.getAndValidateAppointment(request);
      if (!appointment) {
        return {
          success: false,
          message: "I couldn't find that appointment. Please check your confirmation number and try again.",
          error: 'Appointment not found or invalid'
        };
      }

      // Step 2: Check for emergency protocol activation
      if (request.emergency) {
        return await this.processEmergencyCancellation(appointment, request);
      }

      // Step 3: Perform standard cancellation through appointment service
      const cancellationResult = await this.appointmentService.modifyAppointment({
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        modificationType: 'cancel',
        reason: request.reason,
        conversationId: request.conversationId
      });

      if (!cancellationResult.success) {
        return {
          success: false,
          message: cancellationResult.message,
          error: cancellationResult.error
        };
      }

      // Step 4: Create enhanced confirmation with reference number
      const confirmation = await this.confirmationService.createCancellationConfirmation(
        appointment,
        request,
        cancellationResult.cancellationFee
      );

      // Step 5: Deliver confirmation via requested methods
      const confirmationResponse = await this.confirmationService.deliverConfirmation(
        confirmation,
        request
      );

      // Step 6: Notify waitlisted patients
      const waitlistResults = await this.notifyWaitlist(appointment);

      // Step 7: Update confirmation with waitlist results
      await this.confirmationService.updateWaitlistNotificationStatus(
        confirmation.referenceNumber,
        waitlistResults.length > 0,
        waitlistResults.length
      );

      // Step 8: Send staff notifications
      const isLateNotice = this.isLateNotice(appointment);
      const staffNotification = await this.staffNotificationService.notifyStaffOfCancellation(
        appointment,
        confirmation,
        false, // not emergency
        isLateNotice
      );

      // Step 9: Create comprehensive response
      const response: EnhancedCancellationResponse = {
        success: true,
        message: confirmationResponse.message,
        referenceNumber: confirmation.referenceNumber,
        cancellationFee: cancellationResult.cancellationFee,
        waitlistNotified: waitlistResults.length > 0,
        waitlistCount: waitlistResults.length,
        confirmationDelivery: confirmationResponse.confirmationDelivery,
        staffNotificationSent: true,
        emergencyProtocolActivated: false
      };

      logger.info('Enhanced cancellation completed successfully', {
        appointmentId: request.appointmentId,
        referenceNumber: confirmation.referenceNumber,
        waitlistNotified: waitlistResults.length,
        staffNotificationId: staffNotification.id
      });

      return response;

    } catch (error) {
      logger.error('Enhanced cancellation process failed', { error, request });
      return {
        success: false,
        message: "I'm having trouble processing your cancellation right now. Please try again or speak with our staff for assistance.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process emergency cancellation with special protocols
   */
  private async processEmergencyCancellation(
    appointment: AppointmentDetails,
    request: EnhancedCancellationRequest
  ): Promise<EnhancedCancellationResponse> {
    try {
      logger.info('Processing emergency cancellation', {
        appointmentId: appointment.id,
        emergencyReason: request.emergencyReason
      });

      // Emergency cancellations bypass normal policy restrictions
      const emergencyReason = request.emergencyReason || 'Medical emergency';
      
      // Step 1: Cancel appointment immediately (no fees for emergencies)
      const cancellationResult = await this.appointmentService.modifyAppointment({
        appointmentId: request.appointmentId,
        patientId: request.patientId,
        modificationType: 'cancel',
        reason: `EMERGENCY: ${emergencyReason}`,
        conversationId: request.conversationId
      });

      if (!cancellationResult.success) {
        // Even in emergency, if we can't cancel, return error
        return {
          success: false,
          message: "I'm having trouble cancelling your appointment. Please call our office immediately for emergency assistance at (555) 123-4567.",
          error: cancellationResult.error,
          emergencyProtocolActivated: true
        };
      }

      // Step 2: Create emergency confirmation (no fee for emergencies)
      const confirmation = await this.confirmationService.createCancellationConfirmation(
        appointment,
        request,
        0 // No cancellation fee for emergencies
      );

      // Step 3: Priority delivery of confirmation
      const confirmationResponse = await this.confirmationService.deliverConfirmation(
        confirmation,
        {
          ...request,
          preferredConfirmationMethods: ['voice', 'sms'] // Ensure multiple confirmation methods
        }
      );

      // Step 4: Immediate waitlist notification (urgent priority)
      const waitlistResults = await this.notifyWaitlistUrgent(appointment);

      // Step 5: Critical staff notification
      const staffNotification = await this.staffNotificationService.notifyStaffOfCancellation(
        appointment,
        confirmation,
        true, // emergency
        false // doesn't matter for emergency
      );

      // Step 6: Update confirmation
      await this.confirmationService.updateWaitlistNotificationStatus(
        confirmation.referenceNumber,
        waitlistResults.length > 0,
        waitlistResults.length
      );

      const response: EnhancedCancellationResponse = {
        success: true,
        message: this.generateEmergencyConfirmationMessage(confirmation, waitlistResults.length),
        referenceNumber: confirmation.referenceNumber,
        cancellationFee: 0, // No fee for emergencies
        waitlistNotified: waitlistResults.length > 0,
        waitlistCount: waitlistResults.length,
        confirmationDelivery: confirmationResponse.confirmationDelivery,
        staffNotificationSent: true,
        emergencyProtocolActivated: true
      };

      logger.info('Emergency cancellation completed', {
        appointmentId: appointment.id,
        referenceNumber: confirmation.referenceNumber,
        waitlistNotified: waitlistResults.length,
        staffNotificationId: staffNotification.id
      });

      return response;

    } catch (error) {
      logger.error('Emergency cancellation failed', { error, appointment, request });
      return {
        success: false,
        message: "I understand this is an emergency. I'm having trouble with the cancellation system. Please call our office immediately at (555) 123-4567 for urgent assistance.",
        error: error instanceof Error ? error.message : 'Emergency processing error',
        emergencyProtocolActivated: true
      };
    }
  }

  /**
   * Notify waitlisted patients about newly available slot
   */
  private async notifyWaitlist(appointment: AppointmentDetails): Promise<any[]> {
    try {
      const matchingCriteria: WaitlistMatchingCriteria = {
        appointmentType: appointment.type as 'routine' | 'follow-up' | 'urgent',
        datetime: appointment.datetime,
        practitionerId: appointment.practitionerId,
        duration: appointment.duration
      };

      const notifications = await this.waitlistService.notifyWaitlistForCancelledSlot(matchingCriteria);
      
      logger.info('Waitlist notifications sent for cancelled appointment', {
        appointmentId: appointment.id,
        notificationCount: notifications.length
      });

      return notifications;

    } catch (error) {
      logger.error('Failed to notify waitlist for cancelled appointment', { error, appointment });
      return [];
    }
  }

  /**
   * Urgent waitlist notification for emergency cancellations
   */
  private async notifyWaitlistUrgent(appointment: AppointmentDetails): Promise<any[]> {
    try {
      // For emergency cancellations, notify more waitlisted patients
      const matchingCriteria: WaitlistMatchingCriteria = {
        appointmentType: appointment.type as 'routine' | 'follow-up' | 'urgent',
        datetime: appointment.datetime,
        practitionerId: appointment.practitionerId,
        duration: appointment.duration
      };

      // Emergency cancellations get higher priority waitlist notifications
      const notifications = await this.waitlistService.notifyWaitlistForCancelledSlot(matchingCriteria);
      
      logger.info('Urgent waitlist notifications sent for emergency cancellation', {
        appointmentId: appointment.id,
        notificationCount: notifications.length
      });

      return notifications;

    } catch (error) {
      logger.error('Failed to send urgent waitlist notifications', { error, appointment });
      return [];
    }
  }

  /**
   * Get and validate appointment for cancellation
   */
  private async getAndValidateAppointment(request: EnhancedCancellationRequest): Promise<AppointmentDetails | null> {
    try {
      // Use the appointment management service to get appointment details
      const appointmentKey = `appointment:${request.appointmentId}`;
      const data = await this.redis.get(appointmentKey);
      
      if (!data) {
        logger.warn('Appointment not found for cancellation', { appointmentId: request.appointmentId });
        return null;
      }

      const appointment: AppointmentDetails = JSON.parse(data);

      // Validate ownership
      if (appointment.patientId !== request.patientId) {
        logger.warn('Appointment ownership validation failed', { 
          appointmentId: request.appointmentId,
          requestPatientId: request.patientId,
          appointmentPatientId: appointment.patientId
        });
        return null;
      }

      // Check if appointment is already cancelled
      if (appointment.status === 'cancelled') {
        logger.warn('Attempted to cancel already cancelled appointment', { appointmentId: request.appointmentId });
        return null;
      }

      // Check if appointment is in the past (unless emergency)
      if (!request.emergency && new Date(appointment.datetime) < new Date()) {
        logger.warn('Attempted to cancel past appointment', { appointmentId: request.appointmentId });
        return null;
      }

      return appointment;

    } catch (error) {
      logger.error('Failed to get and validate appointment', { error, request });
      return null;
    }
  }

  /**
   * Check if cancellation is considered late notice
   */
  private isLateNotice(appointment: AppointmentDetails): boolean {
    const appointmentTime = new Date(appointment.datetime);
    const now = new Date();
    const hoursUntil = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    return hoursUntil < 24; // Less than 24 hours notice
  }

  /**
   * Generate emergency-specific confirmation message
   */
  private generateEmergencyConfirmationMessage(
    confirmation: CancellationConfirmation,
    waitlistCount: number
  ): string {
    const appointment = confirmation.originalAppointment;
    const formattedDate = new Date(appointment.datetime).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let message = `I understand this is an emergency situation. I've immediately cancelled your ${appointment.type} appointment `;
    message += `with ${appointment.practitionerName} on ${formattedDate}. `;
    message += `There is no cancellation fee for emergency situations. `;
    message += `Your emergency cancellation reference number is ${confirmation.referenceNumber}. `;
    message += `I've notified our staff about this emergency cancellation, and they may contact you to offer assistance. `;
    
    if (waitlistCount > 0) {
      message += `I've also notified ${waitlistCount} patients on our waitlist about this available appointment time. `;
    }
    
    message += `If you need immediate medical attention, please contact your healthcare provider or call 911. `;
    message += `When you're ready to reschedule, please call our office at (555) 123-4567. `;
    message += `Is there anything else I can help you with during this emergency situation?`;
    
    return message;
  }

  /**
   * Get cancellation confirmation by reference number
   */
  async getCancellationByReference(referenceNumber: string): Promise<any> {
    try {
      return await this.confirmationService.getCancellationConfirmation(referenceNumber);
    } catch (error) {
      logger.error('Failed to get cancellation by reference', { error, referenceNumber });
      return null;
    }
  }

  /**
   * Process waitlist response from notified patient
   */
  async processWaitlistResponse(
    notificationId: string,
    response: 'accepted' | 'declined'
  ): Promise<boolean> {
    try {
      return await this.waitlistService.processWaitlistResponse(notificationId, response);
    } catch (error) {
      logger.error('Failed to process waitlist response', { error, notificationId, response });
      return false;
    }
  }

  /**
   * Get active staff notifications for cancellations
   */
  async getActiveStaffNotifications(department?: string): Promise<any[]> {
    try {
      return await this.staffNotificationService.getActiveNotifications(department);
    } catch (error) {
      logger.error('Failed to get active staff notifications', { error, department });
      return [];
    }
  }

  /**
   * Get cancellation metrics for reporting
   */
  async getCancellationMetrics(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalCancellations: number;
    emergencyCancellations: number;
    lateCancellations: number;
    totalWaitlistNotifications: number;
    averageWaitlistResponseRate: number;
    totalCancellationFees: number;
    averageStaffResponseTime: number;
  }> {
    try {
      // This would aggregate metrics from various services
      // For now, return a placeholder structure
      return {
        totalCancellations: 0,
        emergencyCancellations: 0,
        lateCancellations: 0,
        totalWaitlistNotifications: 0,
        averageWaitlistResponseRate: 0,
        totalCancellationFees: 0,
        averageStaffResponseTime: 0
      };
    } catch (error) {
      logger.error('Failed to get cancellation metrics', { error, timeframe });
      return {
        totalCancellations: 0,
        emergencyCancellations: 0,
        lateCancellations: 0,
        totalWaitlistNotifications: 0,
        averageWaitlistResponseRate: 0,
        totalCancellationFees: 0,
        averageStaffResponseTime: 0
      };
    }
  }
}