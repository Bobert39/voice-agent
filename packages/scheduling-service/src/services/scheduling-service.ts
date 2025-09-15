/**
 * Main Scheduling Service
 * 
 * Orchestrates appointment availability queries, bookings,
 * and natural language processing for scheduling requests
 */

import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient } from './openemr-client';
import { AvailabilityService } from './availability-service';
import { AvailabilityResponseGenerator } from './availability-response-generator';
import { AppointmentLookupService } from './appointment-lookup-service';
import { AppointmentManagementService } from './appointment-management-service';
import { AppointmentConfirmationService } from './appointment-confirmation-service';
import { AppointmentReminderService } from './appointment-reminder-service';
import { 
  SchedulingServiceConfig,
  AvailabilityRequest,
  AvailabilityResponse,
  BookingRequest,
  BookingResponse,
  CancellationRequest,
  CancellationResponse,
  AppointmentDetails,
  SchedulingMetrics,
  // Story 3.3 types
  AppointmentLookupRequest,
  AppointmentLookupResponse,
  AppointmentModificationRequest,
  AppointmentModificationResponse,
  RescheduleRequest,
  RescheduleResponse,
  CancellationPolicy,
  // Story 3.5 types
  AppointmentConfirmationRequest,
  AppointmentConfirmationResponse,
  ReminderConfiguration,
  ConfirmationNumberConfig,
  PracticeLocation
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class SchedulingService {
  private openemrClient: OpenEMRSchedulingClient;
  private availabilityService: AvailabilityService;
  private responseGenerator: AvailabilityResponseGenerator;
  private appointmentLookupService: AppointmentLookupService;
  private appointmentManagementService: AppointmentManagementService;
  private appointmentConfirmationService: AppointmentConfirmationService;
  private appointmentReminderService: AppointmentReminderService;
  private redis: Redis;
  private config: SchedulingServiceConfig;
  private metrics: SchedulingMetrics;

  constructor(config: SchedulingServiceConfig) {
    this.config = config;
    
    // Initialize Redis
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0
    });

    // Initialize OpenEMR client
    this.openemrClient = new OpenEMRSchedulingClient({
      baseUrl: config.openemr.baseUrl,
      clientId: config.openemr.clientId,
      clientSecret: config.openemr.clientSecret,
      site: config.openemr.site || 'default',
      scope: 'openid offline_access api:fhir user/Appointment.read user/Appointment.write user/Slot.read user/Practitioner.read'
    });

    // Initialize availability service
    this.availabilityService = new AvailabilityService(
      this.openemrClient,
      this.redis,
      config.businessRules,
      config.cache.enabled
    );

    // Initialize response generator
    this.responseGenerator = new AvailabilityResponseGenerator();

    // Initialize appointment lookup service
    this.appointmentLookupService = new AppointmentLookupService(
      this.openemrClient,
      this.redis
    );

    // Initialize appointment management service
    const cancellationPolicy: CancellationPolicy = {
      minimumNoticeHours: 24,
      feeSchedule: {
        sameDay: 50,
        lessThan24Hours: 25,
        lessThan48Hours: 0,
        moreThan48Hours: 0
      },
      emergencyExceptions: true,
      noShowFee: 75
    };

    this.appointmentManagementService = new AppointmentManagementService(
      this.openemrClient,
      this.availabilityService,
      this.responseGenerator,
      this.redis,
      cancellationPolicy
    );

    // Story 3.5: Initialize confirmation and reminder services
    const confirmationConfig: ConfirmationNumberConfig = {
      prefix: 'CE',
      length: 8,
      includeTimestamp: true,
      voiceOptimized: true,
      collisionCheckEnabled: true
    };

    const practiceLocation: PracticeLocation = {
      name: 'Capitol Eye Care',
      address: '123 Main Street, Anytown, ST 12345',
      directions: 'Located in the Main Street Medical Complex',
      parkingInstructions: 'Free parking available in front of the building',
      accessibilityNotes: 'Wheelchair accessible entrance on the east side'
    };

    this.appointmentConfirmationService = new AppointmentConfirmationService(
      this.redis,
      confirmationConfig,
      practiceLocation
    );

    const reminderConfig: ReminderConfiguration = {
      enabled: true,
      timingOptions: [
        {
          offsetHours: 24,
          label: '24 hours',
          appointmentTypes: ['routine', 'follow-up', 'urgent'],
          deliveryMethods: ['sms', 'email'],
          priority: 'normal'
        },
        {
          offsetHours: 2,
          label: '2 hours',
          appointmentTypes: ['routine', 'urgent'],
          deliveryMethods: ['sms', 'voice'],
          priority: 'high'
        }
      ],
      contentCustomization: true,
      weatherIntegration: true,
      twoWayInteraction: true
    };

    this.appointmentReminderService = new AppointmentReminderService(
      this.redis,
      reminderConfig
    );

    // Initialize metrics
    this.metrics = {
      totalQueries: 0,
      successfulBookings: 0,
      failedBookings: 0,
      cancellations: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      popularTimeSlots: {},
      popularProviders: {}
    };
  }

  /**
   * Initialize service and authenticate with OpenEMR
   */
  async initialize(): Promise<void> {
    try {
      // Authenticate with OpenEMR
      await this.openemrClient.authenticateWithClientCredentials();
      logger.info('Scheduling service initialized successfully');

      // Test connection
      const testResult = await this.openemrClient.testConnection();
      if (!testResult.success) {
        throw new Error(testResult.message);
      }

      // Load metrics from Redis
      await this.loadMetrics();
    } catch (error) {
      logger.error('Failed to initialize scheduling service', { error });
      throw error;
    }
  }

  /**
   * Process availability query from natural language
   */
  async processAvailabilityQuery(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    const startTime = Date.now();
    this.metrics.totalQueries++;

    try {
      // Parse natural language query
      const queryIntent = this.parseAvailabilityQuery(request.query);
      
      if (queryIntent.requiresClarification) {
        return {
          success: true,
          message: this.responseGenerator.generateClarificationResponse(queryIntent.clarificationType || ''),
          requiresClarification: true,
          clarificationType: queryIntent.clarificationType
        };
      }

      // Get available slots
      const slots = await this.availabilityService.getAvailableSlots({
        startDate: queryIntent.startDate!,
        endDate: queryIntent.endDate!,
        appointmentType: queryIntent.appointmentType,
        practitionerId: queryIntent.practitionerId || request.context?.preferredProvider,
        preferredTimeOfDay: queryIntent.preferredTimeOfDay
      });

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeMetric(responseTime);

      // Generate natural language response
      const message = this.responseGenerator.generateAvailabilityResponse(
        slots,
        request.query,
        {
          includeProvider: true,
          includeInstructions: true,
          maxOptions: 3
        }
      );

      return {
        success: true,
        message,
        slots
      };
    } catch (error) {
      logger.error('Failed to process availability query', { error, request });
      return {
        success: false,
        message: "I'm having trouble checking appointment availability right now. Please try again in a moment or ask to speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process natural language query for availability
   */
  async processNaturalLanguageQuery(
    query: any,
    patientId: string | undefined,
    sessionId: string
  ): Promise<{
    response: string;
    requiresFollowUp: boolean;
    slots?: any[];
  }> {
    try {
      // Import the query processor
      const { AvailabilityQueryProcessor } = await import('./availability-query-processor');
      const queryProcessor = new AvailabilityQueryProcessor(
        this.availabilityService,
        this.responseGenerator
      );

      // Process the query
      const result = await queryProcessor.processQuery(query);

      // Log for analytics
      logger.info('Processed natural language availability query', {
        sessionId,
        patientId,
        queryIntent: query.intent,
        slotsFound: result.slots?.length || 0
      });

      return result;
    } catch (error) {
      logger.error('Failed to process natural language query', { error, query, sessionId });
      
      return {
        response: "I'm having trouble understanding your request. Could you please tell me when you'd like to schedule an appointment?",
        requiresFollowUp: true
      };
    }
  }

  /**
   * Book an appointment
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResponse> {
    try {
      // Get slot details
      const slotDetails = await this.getSlotFromId(request.slotId);
      if (!slotDetails) {
        return {
          success: false,
          message: "I couldn't find that appointment slot. It may have been booked by someone else. Would you like me to check for other available times?",
          error: 'Slot not found'
        };
      }

      // Create appointment in OpenEMR
      const appointment = await this.openemrClient.createAppointment({
        start: slotDetails.datetime,
        end: this.calculateEndTime(slotDetails.datetime, slotDetails.duration),
        patientId: request.patientId,
        practitionerId: slotDetails.practitionerId,
        appointmentType: request.appointmentType,
        description: request.reason
      });

      // Generate confirmation number
      const confirmationNumber = this.generateConfirmationNumber();

      // Store appointment details
      await this.storeAppointmentDetails({
        id: appointment.id,
        patientId: request.patientId,
        patientName: '', // Would be fetched from patient service
        practitionerId: slotDetails.practitionerId,
        practitionerName: slotDetails.practitioner,
        datetime: slotDetails.datetime,
        duration: slotDetails.duration,
        type: request.appointmentType,
        status: 'booked',
        reason: request.reason,
        specialRequirements: request.specialRequirements,
        confirmationNumber
      });

      // Update metrics
      this.metrics.successfulBookings++;
      this.updatePopularTimeSlots(slotDetails.datetime);
      this.updatePopularProviders(slotDetails.practitioner);

      // Invalidate cache for the booked time
      await this.availabilityService.invalidateCache(
        slotDetails.datetime.split('T')[0]
      );

      // Story 3.5: Send immediate confirmation and schedule reminders
      const confirmationRequest: AppointmentConfirmationRequest = {
        appointmentId: appointment.id,
        patientId: request.patientId,
        patientName: '', // Would come from patient service
        contactInfo: {
          phoneNumber: '', // Would come from patient service or conversation context
          email: undefined // Would come from patient service
        },
        preferredMethods: ['voice', 'sms'], // Default methods, could be from patient preferences
        immediateDelivery: true,
        includePreparationInstructions: true
      };

      // Send confirmation
      const confirmationResult = await this.appointmentConfirmationService.sendConfirmation(confirmationRequest);
      
      // Schedule reminders
      const storedAppointment = await this.getAppointmentDetails(appointment.id);
      if (storedAppointment) {
        await this.appointmentReminderService.scheduleReminders(storedAppointment);
      }

      // Generate enhanced confirmation message
      let message = confirmationResult.message;
      if (!confirmationResult.success) {
        message = this.responseGenerator.generateBookingConfirmation(
          slotDetails,
          '' // Patient name would come from patient service
        );
      }

      return {
        success: true,
        appointmentId: appointment.id,
        confirmationNumber: confirmationResult.confirmationNumber || confirmationNumber,
        message
      };
    } catch (error) {
      logger.error('Failed to book appointment', { error, request });
      this.metrics.failedBookings++;
      
      return {
        success: false,
        message: "I'm sorry, I couldn't complete your booking. The time slot may no longer be available. Would you like to try a different time?",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(request: CancellationRequest): Promise<CancellationResponse> {
    try {
      // Verify appointment belongs to patient
      const appointment = await this.getAppointmentDetails(request.appointmentId);
      if (!appointment || appointment.patientId !== request.patientId) {
        return {
          success: false,
          message: "I couldn't find an appointment with that information. Please check your confirmation number and try again.",
          error: 'Appointment not found'
        };
      }

      // Cancel in OpenEMR
      await this.openemrClient.cancelAppointment(request.appointmentId, request.reason);

      // Update stored details
      appointment.status = 'cancelled';
      await this.storeAppointmentDetails(appointment);

      // Update metrics
      this.metrics.cancellations++;

      // Invalidate cache to show the slot as available again
      await this.availabilityService.invalidateCache(
        appointment.datetime.split('T')[0]
      );

      return {
        success: true,
        message: "Your appointment has been cancelled. The time slot is now available for other patients. Is there anything else I can help you with?"
      };
    } catch (error) {
      logger.error('Failed to cancel appointment', { error, request });
      return {
        success: false,
        message: "I'm having trouble cancelling your appointment. Please try again or speak with our staff for assistance.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse natural language availability query
   */
  private parseAvailabilityQuery(query: string): {
    startDate?: string;
    endDate?: string;
    appointmentType?: 'routine' | 'follow-up' | 'urgent';
    practitionerId?: string;
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
    requiresClarification: boolean;
    clarificationType?: string;
  } {
    const normalizedQuery = query.toLowerCase();
    const result: any = {
      requiresClarification: false
    };

    // Parse appointment type
    if (normalizedQuery.includes('routine') || normalizedQuery.includes('regular') || normalizedQuery.includes('annual')) {
      result.appointmentType = 'routine';
    } else if (normalizedQuery.includes('follow') || normalizedQuery.includes('check')) {
      result.appointmentType = 'follow-up';
    } else if (normalizedQuery.includes('urgent') || normalizedQuery.includes('asap') || normalizedQuery.includes('emergency')) {
      result.appointmentType = 'urgent';
    }

    // Parse time preferences
    if (normalizedQuery.includes('morning')) {
      result.preferredTimeOfDay = 'morning';
    } else if (normalizedQuery.includes('afternoon')) {
      result.preferredTimeOfDay = 'afternoon';
    } else if (normalizedQuery.includes('evening')) {
      result.preferredTimeOfDay = 'evening';
    }

    // Parse date range using availability service
    const dateRange = this.availabilityService.parseNaturalDate(query);
    if (dateRange) {
      result.startDate = dateRange.startDate;
      result.endDate = dateRange.endDate;
    } else {
      // Default to next 14 days if no specific date mentioned
      const today = new Date();
      const twoWeeks = new Date(today);
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      
      result.startDate = today.toISOString().split('T')[0];
      result.endDate = twoWeeks.toISOString().split('T')[0];
    }

    // Check if we need clarification
    if (!result.appointmentType) {
      result.requiresClarification = true;
      result.clarificationType = 'appointment_type';
    }

    return result;
  }

  /**
   * Calculate appointment end time
   */
  private calculateEndTime(startTime: string, duration: number): string {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);
    return end.toISOString();
  }

  /**
   * Generate confirmation number
   */
  private generateConfirmationNumber(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `CE${timestamp}${random}`.toUpperCase();
  }

  /**
   * Get slot details from ID
   */
  private async getSlotFromId(slotId: string): Promise<any> {
    // This would be retrieved from cache or parsed from the slot ID
    // For now, returning a mock implementation
    const cacheKey = `slot:${slotId}`;
    const cached = await this.redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * Store appointment details
   */
  private async storeAppointmentDetails(appointment: AppointmentDetails): Promise<void> {
    const key = `appointment:${appointment.id}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(appointment)); // Store for 30 days
  }

  /**
   * Get appointment details
   */
  private async getAppointmentDetails(appointmentId: string): Promise<AppointmentDetails | null> {
    const key = `appointment:${appointmentId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update response time metric
   */
  private updateResponseTimeMetric(responseTime: number): void {
    const currentAvg = this.metrics.averageResponseTime;
    const totalQueries = this.metrics.totalQueries;
    this.metrics.averageResponseTime = ((currentAvg * (totalQueries - 1)) + responseTime) / totalQueries;
  }

  /**
   * Update popular time slots
   */
  private updatePopularTimeSlots(datetime: string): void {
    const hour = new Date(datetime).getHours();
    const timeSlot = `${hour}:00`;
    this.metrics.popularTimeSlots[timeSlot] = (this.metrics.popularTimeSlots[timeSlot] || 0) + 1;
  }

  /**
   * Update popular providers
   */
  private updatePopularProviders(provider: string): void {
    this.metrics.popularProviders[provider] = (this.metrics.popularProviders[provider] || 0) + 1;
  }

  /**
   * Load metrics from Redis
   */
  private async loadMetrics(): Promise<void> {
    const metricsKey = 'scheduling:metrics';
    const data = await this.redis.get(metricsKey);
    if (data) {
      this.metrics = JSON.parse(data);
    }
  }

  /**
   * Save metrics to Redis
   */
  async saveMetrics(): Promise<void> {
    const metricsKey = 'scheduling:metrics';
    await this.redis.set(metricsKey, JSON.stringify(this.metrics));
  }

  /**
   * Get current metrics
   */
  getMetrics(): SchedulingMetrics {
    return { ...this.metrics };
  }

  // Story 3.3: Appointment Management Methods

  /**
   * Lookup appointments using various criteria
   */
  async lookupAppointments(request: AppointmentLookupRequest): Promise<AppointmentLookupResponse> {
    try {
      return await this.appointmentLookupService.lookupAppointments(request);
    } catch (error) {
      logger.error('Failed to lookup appointments', { error, request });
      return {
        success: false,
        message: "I'm having trouble finding appointment information right now. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify patient identity for appointment access
   */
  async verifyAppointmentAccess(
    conversationId: string,
    phoneNumber?: string,
    dateOfBirth?: string,
    lastName?: string
  ): Promise<AppointmentLookupResponse> {
    try {
      return await this.appointmentLookupService.verifyAppointmentAccess(conversationId, {
        phoneNumber,
        dateOfBirth,
        lastName,
        method: phoneNumber ? 'phone_dob' : dateOfBirth ? 'name_dob' : 'phone_dob',
        verified: false,
        attempts: 0,
        maxAttempts: 3
      });
    } catch (error) {
      logger.error('Failed to verify appointment access', { error, conversationId });
      return {
        success: false,
        message: "I'm having trouble verifying your information. Let me transfer you to our staff for assistance.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Modify an existing appointment
   */
  async modifyAppointment(request: AppointmentModificationRequest): Promise<AppointmentModificationResponse> {
    try {
      const result = await this.appointmentManagementService.modifyAppointment(request);
      
      // Update metrics
      if (result.success) {
        if (request.modificationType === 'cancel') {
          this.metrics.cancellations++;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to modify appointment', { error, request });
      return {
        success: false,
        message: "I'm having trouble modifying your appointment right now. Please try again or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(request: RescheduleRequest): Promise<RescheduleResponse> {
    try {
      return await this.appointmentManagementService.rescheduleAppointment(request);
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
   * Confirm a reschedule with specific time slot
   */
  async confirmReschedule(
    appointmentId: string,
    patientId: string,
    newSlotId: string,
    conversationId: string
  ): Promise<AppointmentModificationResponse> {
    try {
      return await this.appointmentManagementService.confirmReschedule(
        appointmentId,
        patientId,
        newSlotId,
        conversationId
      );
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
   * Process natural language appointment management request
   */
  async processAppointmentManagementQuery(
    query: string,
    conversationId: string,
    patientId?: string
  ): Promise<{
    response: string;
    requiresFollowUp: boolean;
    requiresVerification?: boolean;
    appointmentData?: any;
  }> {
    try {
      const normalizedQuery = query.toLowerCase();
      
      // Detect intent
      let intent = 'unknown';
      if (normalizedQuery.includes('cancel')) {
        intent = 'cancel';
      } else if (normalizedQuery.includes('reschedule') || normalizedQuery.includes('change') || normalizedQuery.includes('move')) {
        intent = 'reschedule';
      } else if (normalizedQuery.includes('find') || normalizedQuery.includes('lookup') || normalizedQuery.includes('appointment')) {
        intent = 'lookup';
      }

      // Handle lookup intent first
      if (intent === 'lookup') {
        // Extract confirmation number or phone number from query
        const confirmationMatch = query.match(/([A-Z]{2}\w+)/i);
        const phoneMatch = query.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
        
        const lookupRequest: AppointmentLookupRequest = {
          conversationId,
          confirmationNumber: confirmationMatch?.[1],
          phoneNumber: phoneMatch?.[1],
          patientId
        };

        const result = await this.lookupAppointments(lookupRequest);
        
        return {
          response: result.message,
          requiresFollowUp: result.success,
          requiresVerification: result.requiresVerification,
          appointmentData: result.appointments
        };
      }

      // For modification intents, we need appointment context first
      if (!patientId) {
        return {
          response: "I need to find your appointment first. Could you please provide your confirmation number or phone number?",
          requiresFollowUp: true
        };
      }

      // Handle modification intents
      switch (intent) {
        case 'cancel':
          return {
            response: "I can help you cancel your appointment. First, let me find your upcoming appointments. Could you provide your confirmation number or phone number?",
            requiresFollowUp: true
          };
          
        case 'reschedule':
          return {
            response: "I can help you reschedule your appointment. First, let me find your current appointment. Could you provide your confirmation number or phone number?",
            requiresFollowUp: true
          };
          
        default:
          return {
            response: "I can help you look up, reschedule, or cancel your appointments. What would you like to do with your appointment today?",
            requiresFollowUp: true
          };
      }

    } catch (error) {
      logger.error('Failed to process appointment management query', { error, query, conversationId });
      return {
        response: "I'm having trouble understanding your request. Could you please tell me if you'd like to look up, reschedule, or cancel an appointment?",
        requiresFollowUp: true
      };
    }
  }

  // Story 3.5: Appointment Confirmation and Reminder Methods

  /**
   * Send appointment confirmation for existing appointment
   */
  async sendAppointmentConfirmation(request: AppointmentConfirmationRequest): Promise<AppointmentConfirmationResponse> {
    try {
      return await this.appointmentConfirmationService.sendConfirmation(request);
    } catch (error) {
      logger.error('Failed to send appointment confirmation', { error, request });
      return {
        success: false,
        confirmationNumber: '',
        message: "I'm sorry, there was an issue sending your confirmation. Our staff will contact you with your appointment details.",
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
  async lookupConfirmationNumber(confirmationNumber: string): Promise<any> {
    try {
      return await this.appointmentConfirmationService.lookupConfirmation(confirmationNumber);
    } catch (error) {
      logger.error('Failed to lookup confirmation number', { error, confirmationNumber });
      return {
        success: false,
        message: "I'm having trouble looking up that confirmation number. Please try again or contact our office."
      };
    }
  }

  /**
   * Schedule reminders for an appointment
   */
  async scheduleAppointmentReminders(appointmentId: string): Promise<any> {
    try {
      const appointment = await this.getAppointmentDetails(appointmentId);
      if (!appointment) {
        return {
          success: false,
          message: "I couldn't find that appointment to schedule reminders."
        };
      }

      return await this.appointmentReminderService.scheduleReminders(appointment);
    } catch (error) {
      logger.error('Failed to schedule appointment reminders', { error, appointmentId });
      return {
        success: false,
        scheduledReminders: [],
        message: "I wasn't able to schedule reminders, but your appointment is still confirmed."
      };
    }
  }

  /**
   * Cancel reminders for an appointment
   */
  async cancelAppointmentReminders(appointmentId: string): Promise<any> {
    try {
      return await this.appointmentReminderService.cancelReminders(appointmentId);
    } catch (error) {
      logger.error('Failed to cancel appointment reminders', { error, appointmentId });
      return {
        success: false,
        cancelledCount: 0
      };
    }
  }

  /**
   * Process reminder response from patient
   */
  async processReminderResponse(
    reminderId: string,
    responseType: 'confirmed' | 'reschedule_requested' | 'cancel_requested' | 'question',
    responseContent?: string
  ): Promise<any> {
    try {
      return await this.appointmentReminderService.processReminderResponse(
        reminderId,
        responseType,
        responseContent
      );
    } catch (error) {
      logger.error('Failed to process reminder response', { error, reminderId, responseType });
      return {
        success: false,
        nextAction: 'transfer_to_staff',
        staffNotificationSent: false
      };
    }
  }

  /**
   * Get confirmation and reminder analytics
   */
  async getConfirmationAndReminderAnalytics(dateRange?: { start: string; end: string }): Promise<any> {
    try {
      const reminderAnalytics = await this.appointmentReminderService.getReminderAnalytics(dateRange);
      
      // Get confirmation analytics from Redis
      const confirmationAnalyticsKey = 'analytics:confirmations';
      const rawConfirmationData = await this.redis.lrange(confirmationAnalyticsKey, 0, -1);
      
      const confirmationData = rawConfirmationData.map(item => JSON.parse(item))
        .filter(item => {
          if (!dateRange) return true;
          const itemDate = new Date(item.timestamp);
          return itemDate >= new Date(dateRange.start) && itemDate <= new Date(dateRange.end);
        });

      const totalConfirmations = confirmationData.length;
      const successfulConfirmations = confirmationData.filter(d => d.success).length;
      const confirmationSuccessRate = totalConfirmations > 0 ? (successfulConfirmations / totalConfirmations) * 100 : 0;

      // Calculate delivery method effectiveness for confirmations
      const deliveryMethodStats = {};
      for (const item of confirmationData) {
        for (const method of item.deliveryMethods || []) {
          if (!deliveryMethodStats[method]) {
            deliveryMethodStats[method] = { attempted: 0, successful: 0 };
          }
          deliveryMethodStats[method].attempted++;
          if (item.deliveryStatus?.[method]?.delivered) {
            deliveryMethodStats[method].successful++;
          }
        }
      }

      return {
        confirmations: {
          total: totalConfirmations,
          successRate: Math.round(confirmationSuccessRate * 100) / 100,
          deliveryMethodStats,
          averageDeliveryTime: confirmationData.reduce((acc, item) => acc + (item.responseTime || 0), 0) / totalConfirmations || 0
        },
        reminders: reminderAnalytics,
        combined: {
          patientEngagement: {
            confirmationRate: confirmationSuccessRate,
            reminderResponseRate: reminderAnalytics.responseRate,
            overallSatisfaction: Math.round(((confirmationSuccessRate + reminderAnalytics.responseRate) / 2) * 100) / 100
          }
        }
      };
    } catch (error) {
      logger.error('Failed to get confirmation and reminder analytics', { error });
      return {
        confirmations: { total: 0, successRate: 0, deliveryMethodStats: {}, averageDeliveryTime: 0 },
        reminders: { totalReminders: 0, responseRate: 0, methodEffectiveness: {}, timingEffectiveness: {} },
        combined: { patientEngagement: { confirmationRate: 0, reminderResponseRate: 0, overallSatisfaction: 0 } }
      };
    }
  }

  /**
   * Update appointment cancellation to include reminder cancellation
   */
  async cancelAppointment(request: CancellationRequest): Promise<CancellationResponse> {
    try {
      // Call the existing cancellation logic
      const result = await super.cancelAppointment ? super.cancelAppointment(request) : this.cancelAppointmentOriginal(request);
      
      // Cancel associated reminders if cancellation was successful
      if (result.success) {
        await this.cancelAppointmentReminders(request.appointmentId);
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to cancel appointment with reminders', { error, request });
      return {
        success: false,
        message: "I'm having trouble cancelling your appointment. Please try again or speak with our staff for assistance.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Original cancellation method (for reference)
   */
  private async cancelAppointmentOriginal(request: CancellationRequest): Promise<CancellationResponse> {
    try {
      // Verify appointment belongs to patient
      const appointment = await this.getAppointmentDetails(request.appointmentId);
      if (!appointment || appointment.patientId !== request.patientId) {
        return {
          success: false,
          message: "I couldn't find an appointment with that information. Please check your confirmation number and try again.",
          error: 'Appointment not found'
        };
      }

      // Cancel in OpenEMR
      await this.openemrClient.cancelAppointment(request.appointmentId, request.reason);

      // Update stored details
      appointment.status = 'cancelled';
      await this.storeAppointmentDetails(appointment);

      // Update metrics
      this.metrics.cancellations++;

      // Invalidate cache to show the slot as available again
      await this.availabilityService.invalidateCache(
        appointment.datetime.split('T')[0]
      );

      return {
        success: true,
        message: "Your appointment has been cancelled. The time slot is now available for other patients. Is there anything else I can help you with?"
      };
    } catch (error) {
      logger.error('Failed to cancel appointment', { error, request });
      return {
        success: false,
        message: "I'm having trouble cancelling your appointment. Please try again or speak with our staff for assistance.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.saveMetrics();
    await this.openemrClient.logout();
    await this.redis.quit();
  }
}