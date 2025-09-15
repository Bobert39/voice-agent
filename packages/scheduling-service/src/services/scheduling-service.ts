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
import { 
  SchedulingServiceConfig,
  AvailabilityRequest,
  AvailabilityResponse,
  BookingRequest,
  BookingResponse,
  CancellationRequest,
  CancellationResponse,
  AppointmentDetails,
  SchedulingMetrics
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class SchedulingService {
  private openemrClient: OpenEMRSchedulingClient;
  private availabilityService: AvailabilityService;
  private responseGenerator: AvailabilityResponseGenerator;
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

      // Generate confirmation message
      const message = this.responseGenerator.generateBookingConfirmation(
        slotDetails,
        '' // Patient name would come from patient service
      );

      return {
        success: true,
        appointmentId: appointment.id,
        confirmationNumber,
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

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.saveMetrics();
    await this.openemrClient.logout();
    await this.redis.quit();
  }
}