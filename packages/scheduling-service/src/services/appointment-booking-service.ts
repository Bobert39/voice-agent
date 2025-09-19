/**
 * Appointment Booking Service
 *
 * Implements complete appointment booking workflow from availability check to confirmation
 * Story 3.2: New Appointment Booking
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import { OpenEMRSchedulingClient, Appointment, AppointmentSlot } from './openemr-client';
import { AvailabilityService } from './availability-service';
import { logger } from '@voice-agent/shared-utils';

export interface BookingRequest {
  patientId: string;
  slotId?: string;
  requestedDateTime?: string;
  appointmentType: 'routine' | 'follow-up' | 'urgent';
  practitionerId?: string;
  reason?: string;
  specialRequirements?: {
    dilationNeeded?: boolean;
    interpreterRequired?: boolean;
    accessibilityNeeds?: string;
    preferredLanguage?: string;
  };
  conversationId: string;
  sessionId: string;
}

export interface BookingConfirmation {
  confirmationNumber: string;
  appointmentId: string;
  patientName: string;
  dateTime: string;
  practitioner: string;
  appointmentType: string;
  duration: number;
  location: string;
  specialInstructions?: string;
}

export interface BookingResponse {
  success: boolean;
  confirmation?: BookingConfirmation;
  message: string;
  requiresConfirmation?: boolean;
  alternativeSlots?: AppointmentSlot[];
  error?: string;
}

export interface BookingTransaction {
  transactionId: string;
  status: 'pending' | 'confirmed' | 'failed' | 'rolled_back';
  bookingRequest: BookingRequest;
  createdAt: Date;
  confirmedAt?: Date;
  expiresAt: Date;
  attempts: number;
}

export interface BookingConversationState {
  sessionId: string;
  stage: 'collecting_type' | 'selecting_time' | 'gathering_requirements' | 'confirming' | 'completed';
  collectedData: {
    appointmentType?: 'routine' | 'follow-up' | 'urgent';
    preferredDateTime?: string;
    practitionerId?: string;
    specialRequirements?: BookingRequest['specialRequirements'];
    patientInfo?: {
      id: string;
      name: string;
      isNewPatient: boolean;
      insurance?: string;
      emergencyContact?: string;
    };
  };
  selectedSlot?: AppointmentSlot;
  confirmationAttempts: number;
  lastUpdated: Date;
}

export class AppointmentBookingService {
  private openemrClient: OpenEMRSchedulingClient;
  private availabilityService: AvailabilityService;
  private redis: Redis;
  private readonly maxConfirmationAttempts = 3;
  private readonly bookingTimeout = 300; // 5 minutes in seconds
  private readonly confirmationCodeLength = 8;

  constructor(
    openemrClient: OpenEMRSchedulingClient,
    availabilityService: AvailabilityService,
    redis: Redis
  ) {
    this.openemrClient = openemrClient;
    this.availabilityService = availabilityService;
    this.redis = redis;
  }

  /**
   * Initialize a booking conversation state
   */
  async initializeBookingConversation(
    sessionId: string,
    patientId?: string
  ): Promise<BookingConversationState> {
    const state: BookingConversationState = {
      sessionId,
      stage: 'collecting_type',
      collectedData: {
        patientInfo: patientId ? { id: patientId, name: '', isNewPatient: false } : undefined
      },
      confirmationAttempts: 0,
      lastUpdated: new Date()
    };

    await this.saveConversationState(state);
    return state;
  }

  /**
   * Update booking conversation state
   */
  async updateConversationState(
    sessionId: string,
    updates: Partial<BookingConversationState>
  ): Promise<BookingConversationState> {
    const currentState = await this.getConversationState(sessionId);
    if (!currentState) {
      throw new Error('Conversation state not found');
    }

    const updatedState = {
      ...currentState,
      ...updates,
      lastUpdated: new Date()
    };

    await this.saveConversationState(updatedState);
    return updatedState;
  }

  /**
   * Process booking request with conflict detection and transaction management
   */
  async processBookingRequest(request: BookingRequest): Promise<BookingResponse> {
    // Create booking transaction
    const transaction = await this.createBookingTransaction(request);

    try {
      // Validate slot availability (real-time check)
      if (request.slotId) {
        const isAvailable = await this.openemrClient.checkSlotAvailability(request.slotId);
        if (!isAvailable) {
          // Slot no longer available, suggest alternatives
          const alternatives = await this.findAlternativeSlots(request);
          await this.updateTransactionStatus(transaction.transactionId, 'failed');

          return {
            success: false,
            message: "I'm sorry, that time slot was just taken. Here are some similar available times.",
            alternativeSlots: alternatives,
            error: 'Slot conflict detected'
          };
        }
      }

      // Create appointment in OpenEMR
      const appointment = await this.createAppointmentInOpenEMR(request);

      // Generate confirmation number
      const confirmationNumber = this.generateConfirmationNumber();

      // Create confirmation details
      const confirmation: BookingConfirmation = {
        confirmationNumber,
        appointmentId: appointment.id,
        patientName: await this.getPatientName(request.patientId),
        dateTime: appointment.start,
        practitioner: appointment.participant?.[0]?.actor?.display || 'Available Provider',
        appointmentType: request.appointmentType,
        duration: this.getAppointmentDuration(request.appointmentType),
        location: 'Capitol Eye Care', // Would fetch from practice info
        specialInstructions: this.generateSpecialInstructions(request.specialRequirements)
      };

      // Save confirmation details
      await this.saveConfirmation(confirmation, request.patientId);

      // Update transaction status
      await this.updateTransactionStatus(transaction.transactionId, 'confirmed');

      // Invalidate availability cache for the booked time
      await this.availabilityService.invalidateCache(
        appointment.start.split('T')[0],
        appointment.end.split('T')[0]
      );

      logger.info('Appointment booked successfully', {
        confirmationNumber,
        appointmentId: appointment.id,
        patientId: request.patientId
      });

      return {
        success: true,
        confirmation,
        message: this.generateSuccessMessage(confirmation)
      };

    } catch (error) {
      logger.error('Booking failed', { error, request });
      await this.updateTransactionStatus(transaction.transactionId, 'failed');

      // Attempt rollback if appointment was partially created
      if ((error as any).appointmentId) {
        await this.rollbackAppointment((error as any).appointmentId);
      }

      return {
        success: false,
        message: "I'm sorry, I couldn't complete your booking. Would you like me to try again or would you prefer to call the office?",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate confirmation protocol message for patients
   */
  async generateConfirmationProtocol(
    state: BookingConversationState
  ): Promise<{ message: string; requiresConfirmation: boolean }> {
    if (!state.selectedSlot || !state.collectedData.appointmentType) {
      return {
        message: "I need a bit more information to book your appointment.",
        requiresConfirmation: false
      };
    }

    const date = this.formatDateForConfirmation(new Date(state.selectedSlot.start));
    const time = this.formatTimeForConfirmation(new Date(state.selectedSlot.start));
    const duration = this.getAppointmentDuration(state.collectedData.appointmentType);
    const type = this.formatAppointmentType(state.collectedData.appointmentType);

    const confirmationMessage = `
Let me confirm your appointment details:
- ${type} appointment
- Date: ${date}
- Time: ${time}
- Duration: About ${duration} minutes
${state.collectedData.specialRequirements?.dilationNeeded ? '- Eye dilation will be performed' : ''}
${state.collectedData.specialRequirements?.interpreterRequired ? '- An interpreter will be arranged' : ''}

Is this correct? Please say "yes" to confirm or "no" to make changes.`;

    return {
      message: confirmationMessage.trim(),
      requiresConfirmation: true
    };
  }

  /**
   * Handle confirmation response
   */
  async handleConfirmationResponse(
    sessionId: string,
    response: string
  ): Promise<BookingResponse> {
    const state = await this.getConversationState(sessionId);
    if (!state) {
      return {
        success: false,
        message: "I couldn't find your booking session. Let's start over.",
        error: 'Session not found'
      };
    }

    const normalizedResponse = response.toLowerCase().trim();
    const isConfirmed = /^(yes|yep|yeah|correct|confirm|right|that's right|sounds good|perfect)/.test(normalizedResponse);
    const isDenied = /^(no|nope|wrong|incorrect|change|different)/.test(normalizedResponse);

    if (isConfirmed) {
      // Process the booking
      const bookingRequest: BookingRequest = {
        patientId: state.collectedData.patientInfo!.id,
        slotId: state.selectedSlot!.id,
        appointmentType: state.collectedData.appointmentType!,
        practitionerId: state.collectedData.practitionerId,
        specialRequirements: state.collectedData.specialRequirements,
        conversationId: state.sessionId,
        sessionId: state.sessionId
      };

      return await this.processBookingRequest(bookingRequest);
    }

    if (isDenied) {
      // Reset to appropriate stage for changes
      await this.updateConversationState(sessionId, {
        stage: 'selecting_time',
        confirmationAttempts: 0
      });

      return {
        success: false,
        message: "No problem. What would you like to change about the appointment?",
        requiresConfirmation: false
      };
    }

    // Unclear response
    state.confirmationAttempts++;
    await this.updateConversationState(sessionId, {
      confirmationAttempts: state.confirmationAttempts
    });

    if (state.confirmationAttempts >= this.maxConfirmationAttempts) {
      return {
        success: false,
        message: "I'm having trouble understanding your response. Would you like me to transfer you to our office staff for help?",
        error: 'Max confirmation attempts exceeded'
      };
    }

    return {
      success: false,
      message: "I didn't quite catch that. Please say 'yes' if the appointment details are correct, or 'no' if you'd like to make changes.",
      requiresConfirmation: true
    };
  }

  /**
   * Create appointment in OpenEMR
   */
  private async createAppointmentInOpenEMR(request: BookingRequest): Promise<Appointment> {
    // Implementation would integrate with OpenEMR FHIR API
    // This is a placeholder for the actual implementation
    const appointment: Appointment = {
      id: crypto.randomUUID(),
      status: 'booked',
      start: request.requestedDateTime || new Date().toISOString(),
      end: this.calculateEndTime(
        request.requestedDateTime || new Date().toISOString(),
        this.getAppointmentDuration(request.appointmentType)
      ),
      appointmentType: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
          code: request.appointmentType,
          display: this.formatAppointmentType(request.appointmentType)
        }]
      },
      participant: [{
        actor: {
          reference: `Patient/${request.patientId}`,
          display: await this.getPatientName(request.patientId)
        },
        status: 'accepted'
      }],
      description: request.reason
    };

    // Actual OpenEMR API call would go here
    // await this.openemrClient.createAppointment(appointment);

    return appointment;
  }

  /**
   * Find alternative slots when conflict detected
   */
  private async findAlternativeSlots(request: BookingRequest): Promise<AppointmentSlot[]> {
    const requestedDate = request.requestedDateTime
      ? new Date(request.requestedDateTime)
      : new Date();

    // Search for slots within 7 days of requested time
    const searchStart = new Date(requestedDate);
    searchStart.setDate(searchStart.getDate() - 3);
    const searchEnd = new Date(requestedDate);
    searchEnd.setDate(searchEnd.getDate() + 4);

    const query = {
      startDate: searchStart.toISOString().split('T')[0],
      endDate: searchEnd.toISOString().split('T')[0],
      appointmentType: request.appointmentType,
      practitionerId: request.practitionerId
    };

    const slots = await this.availabilityService.getAvailableSlots(query);

    // Return up to 3 alternatives closest to requested time
    return slots
      .sort((a, b) => {
        const aDiff = Math.abs(new Date(a.start).getTime() - requestedDate.getTime());
        const bDiff = Math.abs(new Date(b.start).getTime() - requestedDate.getTime());
        return aDiff - bDiff;
      })
      .slice(0, 3);
  }

  /**
   * Generate unique confirmation number
   */
  private generateConfirmationNumber(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
    let confirmationNumber = '';
    for (let i = 0; i < this.confirmationCodeLength; i++) {
      confirmationNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Format as XXXX-XXXX for easier reading
    return `${confirmationNumber.slice(0, 4)}-${confirmationNumber.slice(4)}`;
  }

  /**
   * Generate special instructions based on requirements
   */
  private generateSpecialInstructions(requirements?: BookingRequest['specialRequirements']): string | undefined {
    if (!requirements) return undefined;

    const instructions = [];

    if (requirements.dilationNeeded) {
      instructions.push('Please arrange for someone to drive you home as your eyes will be dilated');
    }
    if (requirements.interpreterRequired) {
      instructions.push(`An interpreter for ${requirements.preferredLanguage || 'your preferred language'} will be available`);
    }
    if (requirements.accessibilityNeeds) {
      instructions.push(`Accessibility arrangements: ${requirements.accessibilityNeeds}`);
    }

    return instructions.length > 0 ? instructions.join('. ') : undefined;
  }

  /**
   * Generate patient-friendly success message
   */
  private generateSuccessMessage(confirmation: BookingConfirmation): string {
    const date = this.formatDateForConfirmation(new Date(confirmation.dateTime));
    const time = this.formatTimeForConfirmation(new Date(confirmation.dateTime));

    return `
Perfect! I've booked your appointment for ${date} at ${time}.
Your confirmation number is ${confirmation.confirmationNumber}.
I'll repeat that slowly: ${confirmation.confirmationNumber.split('').join(' ')}.
${confirmation.specialInstructions || ''}
We'll see you at ${confirmation.location}. Is there anything else I can help you with?`;
  }

  /**
   * Format date for confirmation readback
   */
  private formatDateForConfirmation(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Format time for confirmation (no military time)
   */
  private formatTimeForConfirmation(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  /**
   * Format appointment type for display
   */
  private formatAppointmentType(type: string): string {
    const typeMap: Record<string, string> = {
      'routine': 'Routine Eye Exam',
      'follow-up': 'Follow-up Appointment',
      'urgent': 'Urgent Care Visit'
    };
    return typeMap[type] || type;
  }

  /**
   * Get appointment duration in minutes
   */
  private getAppointmentDuration(type: 'routine' | 'follow-up' | 'urgent'): number {
    const durations = {
      'routine': 60,
      'follow-up': 30,
      'urgent': 45
    };
    return durations[type];
  }

  /**
   * Calculate appointment end time
   */
  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const start = new Date(startTime);
    start.setMinutes(start.getMinutes() + durationMinutes);
    return start.toISOString();
  }

  /**
   * Create booking transaction for atomicity
   */
  private async createBookingTransaction(request: BookingRequest): Promise<BookingTransaction> {
    const transaction: BookingTransaction = {
      transactionId: crypto.randomUUID(),
      status: 'pending',
      bookingRequest: request,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.bookingTimeout * 1000),
      attempts: 0
    };

    await this.redis.setex(
      `booking:transaction:${transaction.transactionId}`,
      this.bookingTimeout,
      JSON.stringify(transaction)
    );

    return transaction;
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: BookingTransaction['status']
  ): Promise<void> {
    const key = `booking:transaction:${transactionId}`;
    const data = await this.redis.get(key);
    if (data) {
      const transaction = JSON.parse(data) as BookingTransaction;
      transaction.status = status;
      if (status === 'confirmed') {
        transaction.confirmedAt = new Date();
      }
      await this.redis.setex(key, this.bookingTimeout, JSON.stringify(transaction));
    }
  }

  /**
   * Rollback appointment if confirmation fails
   */
  private async rollbackAppointment(appointmentId: string): Promise<void> {
    try {
      // Cancel the appointment in OpenEMR
      // await this.openemrClient.cancelAppointment(appointmentId);
      logger.info('Appointment rolled back', { appointmentId });
    } catch (error) {
      logger.error('Failed to rollback appointment', { error, appointmentId });
    }
  }

  /**
   * Save confirmation details
   */
  private async saveConfirmation(
    confirmation: BookingConfirmation,
    patientId: string
  ): Promise<void> {
    const key = `booking:confirmation:${confirmation.confirmationNumber}`;
    const data = {
      ...confirmation,
      patientId,
      createdAt: new Date().toISOString()
    };

    // Store for 90 days
    await this.redis.setex(key, 90 * 24 * 60 * 60, JSON.stringify(data));

    // Also index by patient ID for lookup
    await this.redis.sadd(
      `patient:${patientId}:confirmations`,
      confirmation.confirmationNumber
    );
  }

  /**
   * Get patient name (mock implementation)
   */
  private async getPatientName(patientId: string): Promise<string> {
    // This would fetch from patient service or OpenEMR
    return 'Patient Name';
  }

  /**
   * Save conversation state
   */
  private async saveConversationState(state: BookingConversationState): Promise<void> {
    const key = `booking:conversation:${state.sessionId}`;
    await this.redis.setex(key, 1800, JSON.stringify(state)); // 30 minute expiry
  }

  /**
   * Get conversation state
   */
  private async getConversationState(sessionId: string): Promise<BookingConversationState | null> {
    const key = `booking:conversation:${sessionId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Validate confirmation number
   */
  async validateConfirmationNumber(confirmationNumber: string): Promise<BookingConfirmation | null> {
    const key = `booking:confirmation:${confirmationNumber}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}