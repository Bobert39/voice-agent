/**
 * Appointment Management Service
 * 
 * Handles appointment modifications including rescheduling, cancellation,
 * and type changes with policy enforcement and conflict detection.
 */

import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient } from './openemr-client';
import { AvailabilityService } from './availability-service';
import { AvailabilityResponseGenerator } from './availability-response-generator';
import { 
  AppointmentModificationRequest,
  AppointmentModificationResponse,
  RescheduleRequest,
  RescheduleResponse,
  AppointmentDetails,
  AppointmentChangeHistory,
  CancellationPolicy,
  ModificationConflict,
  TimeSlot
} from '../types';
// Temporary logger implementation
const logger = {
  error: (message: string, details?: any) => console.error(message, details),
  info: (message: string, details?: any) => console.info(message, details),
  warn: (message: string, details?: any) => console.warn(message, details)
};

export class AppointmentManagementService {
  private openemrClient: OpenEMRSchedulingClient;
  private availabilityService: AvailabilityService;
  private responseGenerator: AvailabilityResponseGenerator;
  private redis: Redis;
  private cancellationPolicy: CancellationPolicy;

  constructor(
    openemrClient: OpenEMRSchedulingClient,
    availabilityService: AvailabilityService,
    responseGenerator: AvailabilityResponseGenerator,
    redis: Redis,
    cancellationPolicy: CancellationPolicy
  ) {
    this.openemrClient = openemrClient;
    this.availabilityService = availabilityService;
    this.responseGenerator = responseGenerator;
    this.redis = redis;
    this.cancellationPolicy = cancellationPolicy;
  }

  /**
   * Handle general appointment modification requests
   */
  async modifyAppointment(request: AppointmentModificationRequest): Promise<AppointmentModificationResponse> {
    try {
      // Get current appointment details
      const appointment = await this.getAppointmentDetails(request.appointmentId);
      if (!appointment) {
        return {
          success: false,
          message: "I couldn't find that appointment. Please check your confirmation number and try again.",
          error: 'Appointment not found'
        };
      }

      // Verify ownership
      if (appointment.patientId !== request.patientId) {
        return {
          success: false,
          message: "I couldn't find an appointment with that information for your account. Please verify your confirmation number.",
          error: 'Appointment ownership verification failed'
        };
      }

      // Check if appointment is in the past
      if (this.isAppointmentInPast(appointment)) {
        return {
          success: false,
          message: "That appointment has already passed. I can only help you modify upcoming appointments. Would you like to schedule a new appointment instead?",
          error: 'Cannot modify past appointment'
        };
      }

      // Route to specific modification handler
      switch (request.modificationType) {
        case 'reschedule':
          return await this.handleRescheduleRequest({
            appointmentId: request.appointmentId,
            patientId: request.patientId,
            preferredDateTime: request.newDateTime,
            conversationId: request.conversationId
          });

        case 'cancel':
          return await this.handleCancellationRequest(appointment, request.reason || '', request.conversationId);

        case 'change_type':
          return await this.handleTypeChangeRequest(
            appointment, 
            request.newAppointmentType!, 
            request.reason || '',
            request.conversationId
          );

        default:
          return {
            success: false,
            message: "I'm not sure what type of change you'd like to make. Would you like to reschedule, cancel, or change the type of your appointment?",
            error: 'Unknown modification type'
          };
      }

    } catch (error) {
      logger.error('Failed to modify appointment', { error, request });
      return {
        success: false,
        message: "I'm having trouble modifying your appointment right now. Please try again in a moment or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle reschedule requests with availability checking
   */
  async rescheduleAppointment(request: RescheduleRequest): Promise<RescheduleResponse> {
    try {
      // Get current appointment
      const appointment = await this.getAppointmentDetails(request.appointmentId);
      if (!appointment) {
        return {
          success: false,
          message: "I couldn't find that appointment to reschedule.",
          error: 'Appointment not found'
        };
      }

      // Check cancellation policy for rescheduling
      const hoursUntilAppointment = this.getHoursUntilAppointment(appointment);
      if (hoursUntilAppointment < this.cancellationPolicy.minimumNoticeHours) {
        return {
          success: false,
          message: `I'm sorry, but appointments can only be rescheduled with at least ${this.cancellationPolicy.minimumNoticeHours} hours notice. Your appointment is in ${Math.round(hoursUntilAppointment)} hours. Would you like me to transfer you to our staff who may be able to help?`,
          error: 'Insufficient notice for rescheduling'
        };
      }

      // Get available slots for rescheduling
      const dateRange = request.dateRange || this.getDefaultRescheduleRange();
      const slots = await this.availabilityService.getAvailableSlots({
        startDate: dateRange.start,
        endDate: dateRange.end,
        appointmentType: appointment.type as 'routine' | 'follow-up' | 'urgent',
        practitionerId: appointment.practitionerId,
        preferredTimeOfDay: request.preferredTimeOfDay
      });

      if (slots.length === 0) {
        return {
          success: false,
          message: "I don't see any available appointments that match your preferences. Would you like me to check different dates or times, or transfer you to our staff for more options?",
          error: 'No available slots'
        };
      }

      // Check for conflicts if specific time requested
      if (request.preferredDateTime) {
        const conflicts = await this.checkRescheduleConflicts(appointment, request.preferredDateTime);
        if (conflicts.length > 0) {
          const conflictMessage = conflicts.map(c => c.message).join(' ');
          return {
            success: false,
            message: `${conflictMessage} Would you like me to suggest some alternative times?`,
            conflictWarning: conflictMessage,
            availableSlots: slots.slice(0, 3)
          };
        }
      }

      // Generate response with available options
      const message = this.generateRescheduleOptions(appointment, slots.slice(0, 3));

      return {
        success: true,
        message,
        availableSlots: slots.slice(0, 3),
        originalAppointment: appointment,
        requiresConfirmation: true
      };

    } catch (error) {
      logger.error('Failed to reschedule appointment', { error, request });
      return {
        success: false,
        message: "I'm having trouble finding new appointment times. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Confirm reschedule with specific time slot
   */
  async confirmReschedule(
    appointmentId: string,
    patientId: string,
    newSlotId: string,
    conversationId: string
  ): Promise<AppointmentModificationResponse> {
    try {
      const appointment = await this.getAppointmentDetails(appointmentId);
      if (!appointment) {
        return {
          success: false,
          message: "I couldn't find the original appointment.",
          error: 'Original appointment not found'
        };
      }

      // Get new slot details
      const newSlot = await this.getSlotDetails(newSlotId);
      if (!newSlot) {
        return {
          success: false,
          message: "That time slot is no longer available. Let me check for other options.",
          error: 'New slot not available'
        };
      }

      // Create change history record
      const changeHistory: AppointmentChangeHistory = {
        id: this.generateChangeId(),
        appointmentId,
        changeType: 'rescheduled',
        previousDetails: {
          datetime: appointment.datetime,
          practitionerId: appointment.practitionerId,
          practitionerName: appointment.practitionerName
        },
        newDetails: {
          datetime: newSlot.datetime,
          practitionerId: newSlot.practitionerId,
          practitionerName: newSlot.practitioner
        },
        changedBy: patientId,
        timestamp: new Date().toISOString(),
        reason: 'Patient requested reschedule'
      };

      // Update appointment in OpenEMR
      const updatedAppointment = await this.openemrClient.updateAppointment(appointmentId, {
        start: newSlot.datetime,
        practitionerId: newSlot.practitionerId,
        duration: newSlot.duration
      });

      // Generate new confirmation number
      const newConfirmationNumber = this.generateConfirmationNumber();

      // Update stored appointment details
      const updatedDetails: AppointmentDetails = {
        ...appointment,
        datetime: newSlot.datetime,
        practitionerId: newSlot.practitionerId,
        practitionerName: newSlot.practitioner,
        duration: newSlot.duration,
        confirmationNumber: newConfirmationNumber
      };

      await this.storeAppointmentDetails(updatedDetails);
      await this.storeChangeHistory(changeHistory);

      // Invalidate availability cache
      await this.invalidateAvailabilityCache(appointment.datetime, newSlot.datetime);

      // Generate confirmation message
      const message = this.generateRescheduleConfirmation(appointment, updatedDetails);

      return {
        success: true,
        message,
        updatedAppointment: updatedDetails,
        newConfirmationNumber
      };

    } catch (error) {
      logger.error('Failed to confirm reschedule', { error, appointmentId, newSlotId });
      return {
        success: false,
        message: "I'm sorry, I couldn't complete the reschedule. The time slot may no longer be available. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle appointment cancellation with policy enforcement
   */
  private async handleCancellationRequest(
    appointment: AppointmentDetails,
    reason: string,
    conversationId: string
  ): Promise<AppointmentModificationResponse> {
    try {
      // Calculate cancellation fee
      const hoursUntilAppointment = this.getHoursUntilAppointment(appointment);
      const cancellationFee = this.calculateCancellationFee(hoursUntilAppointment);

      // Create change history
      const changeHistory: AppointmentChangeHistory = {
        id: this.generateChangeId(),
        appointmentId: appointment.id,
        changeType: 'cancelled',
        previousDetails: { status: appointment.status },
        newDetails: { status: 'cancelled' },
        changedBy: appointment.patientId,
        timestamp: new Date().toISOString(),
        reason,
        cancellationFee
      };

      // Cancel in OpenEMR
      await this.openemrClient.cancelAppointment(appointment.id, reason);

      // Update stored details
      const cancelledAppointment: AppointmentDetails = {
        ...appointment,
        status: 'cancelled'
      };

      await this.storeAppointmentDetails(cancelledAppointment);
      await this.storeChangeHistory(changeHistory);

      // Invalidate cache to show slot as available
      await this.availabilityService.invalidateCache(appointment.datetime.split('T')[0]);

      // Generate confirmation message
      let message = `Your ${appointment.type} appointment on ${this.formatAppointmentDate(appointment.datetime)} has been cancelled.`;
      
      if (cancellationFee > 0) {
        message += ` There is a $${cancellationFee} cancellation fee because this is within ${this.cancellationPolicy.minimumNoticeHours} hours of your appointment.`;
      }
      
      message += " The time slot is now available for other patients. Is there anything else I can help you with?";

      return {
        success: true,
        message,
        updatedAppointment: cancelledAppointment,
        cancellationFee: cancellationFee > 0 ? cancellationFee : undefined
      };

    } catch (error) {
      logger.error('Failed to cancel appointment', { error, appointmentId: appointment.id });
      return {
        success: false,
        message: "I'm having trouble cancelling your appointment. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle appointment type changes
   */
  private async handleTypeChangeRequest(
    appointment: AppointmentDetails,
    newType: 'routine' | 'follow-up' | 'urgent',
    reason: string,
    conversationId: string
  ): Promise<AppointmentModificationResponse> {
    try {
      if (appointment.type === newType) {
        return {
          success: false,
          message: `Your appointment is already a ${newType} appointment. Would you like to make a different change?`,
          error: 'Same appointment type'
        };
      }

      // Check if provider can handle the new appointment type
      const providerCapabilities = await this.checkProviderCapabilities(appointment.practitionerId, newType);
      if (!providerCapabilities.canHandle) {
        return {
          success: false,
          message: `${appointment.practitionerName} doesn't handle ${newType} appointments. Would you like me to find a different provider or keep your current appointment type?`,
          error: 'Provider cannot handle appointment type'
        };
      }

      // Check if time slot duration needs adjustment
      const currentDuration = appointment.duration;
      const newDuration = this.getAppointmentDuration(newType);
      
      if (newDuration !== currentDuration) {
        // Check if the new duration fits in the current slot
        const hasSpace = await this.checkDurationFits(appointment, newDuration);
        if (!hasSpace) {
          return {
            success: false,
            message: `A ${newType} appointment needs ${newDuration} minutes, but your current time slot only has ${currentDuration} minutes available. Would you like me to help you reschedule to a longer time slot?`,
            requiresApproval: true,
            error: 'Duration adjustment needed'
          };
        }
      }

      // Create change history
      const changeHistory: AppointmentChangeHistory = {
        id: this.generateChangeId(),
        appointmentId: appointment.id,
        changeType: 'type_changed',
        previousDetails: { 
          type: appointment.type,
          duration: appointment.duration
        },
        newDetails: { 
          type: newType,
          duration: newDuration
        },
        changedBy: appointment.patientId,
        timestamp: new Date().toISOString(),
        reason
      };

      // Update in OpenEMR
      await this.openemrClient.updateAppointment(appointment.id, {
        appointmentType: newType,
        duration: newDuration
      });

      // Update stored details
      const updatedAppointment: AppointmentDetails = {
        ...appointment,
        type: newType,
        duration: newDuration
      };

      await this.storeAppointmentDetails(updatedAppointment);
      await this.storeChangeHistory(changeHistory);

      const message = `I've changed your appointment to a ${newType} appointment. ${newDuration !== currentDuration ? `The duration has been adjusted to ${newDuration} minutes. ` : ''}Your appointment with ${appointment.practitionerName} is still scheduled for ${this.formatAppointmentDate(appointment.datetime)}.`;

      return {
        success: true,
        message,
        updatedAppointment
      };

    } catch (error) {
      logger.error('Failed to change appointment type', { error, appointmentId: appointment.id, newType });
      return {
        success: false,
        message: "I'm having trouble changing your appointment type. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Helper method to handle reschedule requests (called from modifyAppointment)
   */
  private async handleRescheduleRequest(request: RescheduleRequest): Promise<AppointmentModificationResponse> {
    const rescheduleResponse = await this.rescheduleAppointment(request);
    
    // Convert RescheduleResponse to AppointmentModificationResponse
    return {
      success: rescheduleResponse.success,
      message: rescheduleResponse.message,
      error: rescheduleResponse.error,
      requiresApproval: rescheduleResponse.requiresConfirmation
    };
  }

  // Private helper methods

  private async getAppointmentDetails(appointmentId: string): Promise<AppointmentDetails | null> {
    const key = `appointment:${appointmentId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async storeAppointmentDetails(appointment: AppointmentDetails): Promise<void> {
    const key = `appointment:${appointment.id}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(appointment)); // 30 days
  }

  private async storeChangeHistory(history: AppointmentChangeHistory): Promise<void> {
    const key = `appointment:history:${history.appointmentId}:${history.id}`;
    await this.redis.setex(key, 86400 * 365 * 7, JSON.stringify(history)); // 7 years for HIPAA
  }

  private isAppointmentInPast(appointment: AppointmentDetails): boolean {
    return new Date(appointment.datetime) < new Date();
  }

  private getHoursUntilAppointment(appointment: AppointmentDetails): number {
    const now = new Date();
    const appointmentTime = new Date(appointment.datetime);
    return (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  }

  private calculateCancellationFee(hoursUntil: number): number {
    if (hoursUntil < 0) {
      return this.cancellationPolicy.noShowFee;
    } else if (hoursUntil < 24) {
      return this.cancellationPolicy.feeSchedule.lessThan24Hours;
    } else if (hoursUntil < 48) {
      return this.cancellationPolicy.feeSchedule.lessThan48Hours;
    } else {
      return this.cancellationPolicy.feeSchedule.moreThan48Hours;
    }
  }

  private async checkRescheduleConflicts(
    appointment: AppointmentDetails, 
    newDateTime: string
  ): Promise<ModificationConflict[]> {
    const conflicts: ModificationConflict[] = [];

    // Check if new time conflicts with existing appointments
    const existingSlot = await this.availabilityService.checkSlotAvailability(
      newDateTime,
      appointment.practitionerId,
      appointment.duration
    );

    if (!existingSlot.available) {
      conflicts.push({
        type: 'time_conflict',
        message: "That time slot is no longer available.",
        suggestion: "Let me suggest some alternative times."
      });
    }

    return conflicts;
  }

  private generateRescheduleOptions(appointment: AppointmentDetails, slots: TimeSlot[]): string {
    const currentDate = this.formatAppointmentDate(appointment.datetime);
    let message = `I can help you reschedule your ${appointment.type} appointment currently scheduled for ${currentDate}. Here are some available options:\n\n`;
    
    slots.forEach((slot, index) => {
      const date = this.formatAppointmentDate(slot.datetime);
      message += `${index + 1}. ${date} with ${slot.practitioner}\n`;
    });
    
    message += "\nWhich option would you prefer, or would you like me to check different dates?";
    return message;
  }

  private generateRescheduleConfirmation(
    original: AppointmentDetails, 
    updated: AppointmentDetails
  ): string {
    const originalDate = this.formatAppointmentDate(original.datetime);
    const newDate = this.formatAppointmentDate(updated.datetime);
    
    return `Perfect! I've rescheduled your ${updated.type} appointment from ${originalDate} to ${newDate} with ${updated.practitionerName}. Your new confirmation number is ${updated.confirmationNumber}. You should receive a confirmation message shortly.`;
  }

  private formatAppointmentDate(datetime: string): string {
    const date = new Date(datetime);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  private generateConfirmationNumber(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `CE${timestamp}${random}`.toUpperCase();
  }

  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private getDefaultRescheduleRange(): { start: string; end: string } {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 30);
    
    return {
      start: today.toISOString().split('T')[0],
      end: futureDate.toISOString().split('T')[0]
    };
  }

  private async getSlotDetails(slotId: string): Promise<TimeSlot | null> {
    const key = `slot:${slotId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async invalidateAvailabilityCache(oldDateTime: string, newDateTime: string): Promise<void> {
    const oldDate = oldDateTime.split('T')[0];
    const newDate = newDateTime.split('T')[0];
    
    await this.availabilityService.invalidateCache(oldDate);
    if (oldDate !== newDate) {
      await this.availabilityService.invalidateCache(newDate);
    }
  }

  private async checkProviderCapabilities(
    practitionerId: string, 
    appointmentType: string
  ): Promise<{ canHandle: boolean; reason?: string }> {
    // This would check provider specializations and capabilities
    // For now, assume all providers can handle all appointment types
    return { canHandle: true };
  }

  private getAppointmentDuration(type: 'routine' | 'follow-up' | 'urgent'): number {
    const durations = {
      'routine': 60,
      'follow-up': 30,
      'urgent': 45
    };
    return durations[type];
  }

  private async checkDurationFits(
    appointment: AppointmentDetails, 
    newDuration: number
  ): Promise<boolean> {
    // Check if the new duration fits in the available time slot
    // This would involve checking the next appointment and available buffer time
    return true; // Simplified for now
  }
}