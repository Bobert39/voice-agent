/**
 * Appointment Lookup Service
 * 
 * Secure appointment search and verification service for Story 3.3.
 * Supports multiple lookup methods with patient verification.
 */

import { Redis } from 'ioredis';
import { OpenEMRSchedulingClient } from './openemr-client';
import { 
  AppointmentLookupRequest,
  AppointmentLookupResponse,
  AppointmentDetails,
  AppointmentVerification
} from '../types';
import { logger } from '@voice-agent/shared-utils';

export class AppointmentLookupService {
  private openemrClient: OpenEMRSchedulingClient;
  private redis: Redis;
  
  constructor(openemrClient: OpenEMRSchedulingClient, redis: Redis) {
    this.openemrClient = openemrClient;
    this.redis = redis;
  }

  /**
   * Lookup appointments using multiple search methods
   */
  async lookupAppointments(request: AppointmentLookupRequest): Promise<AppointmentLookupResponse> {
    try {
      let appointments: AppointmentDetails[] = [];

      // Try different lookup methods in order of reliability
      if (request.confirmationNumber) {
        appointments = await this.lookupByConfirmationNumber(request.confirmationNumber);
      } else if (request.patientId) {
        appointments = await this.lookupByPatientId(request.patientId, request.dateRange);
      } else if (request.phoneNumber) {
        appointments = await this.lookupByPhoneNumber(request.phoneNumber, request.dateRange);
      } else {
        return {
          success: false,
          message: "I need either your confirmation number, phone number, or patient ID to find your appointment. Which would you prefer to use?",
          error: 'Insufficient lookup criteria'
        };
      }

      if (appointments.length === 0) {
        return await this.handleNoAppointmentsFound(request);
      }

      // Filter for upcoming appointments (not past appointments)
      const upcomingAppointments = this.filterUpcomingAppointments(appointments);

      if (upcomingAppointments.length === 0) {
        return {
          success: true,
          message: "I found some past appointments but no upcoming ones. Would you like to schedule a new appointment instead?",
          appointments: []
        };
      }

      // Check if verification is needed based on lookup method
      const needsVerification = this.determineIfVerificationNeeded(request);
      
      if (needsVerification) {
        // Store appointments temporarily for verification
        await this.storeAppointmentsForVerification(request.conversationId, upcomingAppointments);
        
        return {
          success: true,
          message: this.generateVerificationPrompt(request, upcomingAppointments.length),
          requiresVerification: true,
          verificationMethod: this.getVerificationMethod(request)
        };
      }

      return {
        success: true,
        message: this.generateAppointmentSummary(upcomingAppointments),
        appointments: upcomingAppointments
      };

    } catch (error) {
      logger.error('Failed to lookup appointments', { error, request });
      return {
        success: false,
        message: "I'm having trouble accessing appointment information right now. Please try again in a moment or speak with our staff.",
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify patient identity for appointment access
   */
  async verifyAppointmentAccess(
    conversationId: string,
    verificationData: Partial<AppointmentVerification>
  ): Promise<AppointmentLookupResponse> {
    try {
      // Get stored appointments from verification session
      const storedAppointments = await this.getStoredAppointmentsForVerification(conversationId);
      if (!storedAppointments) {
        return {
          success: false,
          message: "I couldn't find the appointment information. Let's start over with your confirmation number or phone number.",
          error: 'Verification session expired'
        };
      }

      // Get current verification status
      const verification = await this.getVerificationStatus(conversationId);
      if (!verification) {
        return {
          success: false,
          message: "Verification session has expired. Please start over with your appointment lookup.",
          error: 'No verification session'
        };
      }

      // Increment attempt counter
      verification.attempts++;
      
      // Verify the provided information
      const isVerified = await this.performVerification(storedAppointments, verificationData);
      
      if (isVerified) {
        verification.verified = true;
        await this.updateVerificationStatus(conversationId, verification);
        await this.clearVerificationSession(conversationId);
        
        return {
          success: true,
          message: this.generateAppointmentSummary(storedAppointments),
          appointments: storedAppointments
        };
      } else {
        verification.verified = false;
        await this.updateVerificationStatus(conversationId, verification);
        
        // Check if max attempts reached
        if (verification.attempts >= verification.maxAttempts) {
          await this.clearVerificationSession(conversationId);
          return {
            success: false,
            message: "I wasn't able to verify your identity after several attempts. For your security, I'll need to transfer you to our staff who can help you access your appointment information.",
            error: 'Max verification attempts exceeded'
          };
        }
        
        const remainingAttempts = verification.maxAttempts - verification.attempts;
        return {
          success: false,
          message: `The information doesn't match our records. You have ${remainingAttempts} more attempt${remainingAttempts !== 1 ? 's' : ''}. ${this.generateVerificationPrompt({ conversationId }, storedAppointments.length)}`,
          requiresVerification: true,
          verificationMethod: verification.method
        };
      }

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
   * Lookup by confirmation number
   */
  private async lookupByConfirmationNumber(confirmationNumber: string): Promise<AppointmentDetails[]> {
    // First check Redis cache
    const cacheKey = `appointment:confirmation:${confirmationNumber}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const appointment = JSON.parse(cached);
      return [appointment];
    }

    // Search OpenEMR by confirmation number
    const appointments = await this.openemrClient.searchAppointments({
      confirmationNumber
    });

    // Cache the result
    if (appointments.length > 0) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(appointments[0])); // 5 minute cache
    }

    return appointments;
  }

  /**
   * Lookup by patient ID
   */
  private async lookupByPatientId(
    patientId: string, 
    dateRange?: { start: string; end: string }
  ): Promise<AppointmentDetails[]> {
    const range = dateRange || this.getDefaultDateRange();
    
    const cacheKey = `appointments:patient:${patientId}:${range.start}:${range.end}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const appointments = await this.openemrClient.searchAppointments({
      patientId,
      startDate: range.start,
      endDate: range.end
    });

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(appointments));
    
    return appointments;
  }

  /**
   * Lookup by phone number
   */
  private async lookupByPhoneNumber(
    phoneNumber: string, 
    dateRange?: { start: string; end: string }
  ): Promise<AppointmentDetails[]> {
    const range = dateRange || this.getDefaultDateRange();
    
    // First find patient by phone number
    const patients = await this.openemrClient.searchPatientsByPhone(phoneNumber);
    if (patients.length === 0) {
      return [];
    }

    // Then get appointments for all matching patients
    const allAppointments: AppointmentDetails[] = [];
    
    for (const patient of patients) {
      const appointments = await this.lookupByPatientId(patient.id, range);
      allAppointments.push(...appointments);
    }

    return allAppointments;
  }

  /**
   * Filter for upcoming appointments
   */
  private filterUpcomingAppointments(appointments: AppointmentDetails[]): AppointmentDetails[] {
    const now = new Date();
    return appointments.filter(apt => {
      const appointmentTime = new Date(apt.datetime);
      return appointmentTime > now;
    });
  }

  /**
   * Determine if verification is needed
   */
  private determineIfVerificationNeeded(request: AppointmentLookupRequest): boolean {
    // Confirmation number lookup doesn't need additional verification
    if (request.confirmationNumber) {
      return false;
    }
    
    // Phone number and patient ID lookups need verification for security
    return true;
  }

  /**
   * Get verification method based on request type
   */
  private getVerificationMethod(request: AppointmentLookupRequest): 'phone' | 'dob' | 'name' {
    if (request.phoneNumber) {
      return 'dob'; // Phone provided, ask for date of birth
    }
    return 'phone'; // Patient ID provided, ask for phone
  }

  /**
   * Generate verification prompt
   */
  private generateVerificationPrompt(
    request: Partial<AppointmentLookupRequest>, 
    appointmentCount: number
  ): string {
    const appointmentText = appointmentCount === 1 ? 'an appointment' : `${appointmentCount} appointments`;
    
    if (request.phoneNumber) {
      return `I found ${appointmentText} for that phone number. For security, I need to verify your date of birth. Could you please tell me your date of birth?`;
    } else {
      return `I found ${appointmentText} for that patient ID. For security, I need to verify your phone number. Could you please tell me your phone number?`;
    }
  }

  /**
   * Generate appointment summary
   */
  private generateAppointmentSummary(appointments: AppointmentDetails[]): string {
    if (appointments.length === 1) {
      const apt = appointments[0];
      const date = new Date(apt.datetime);
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
      
      return `I found your ${apt.type} appointment with ${apt.practitionerName} on ${dateStr} at ${timeStr}. Your confirmation number is ${apt.confirmationNumber}. What would you like to do with this appointment?`;
    } else {
      const sortedApts = appointments.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
      const nextApt = sortedApts[0];
      const date = new Date(nextApt.datetime);
      const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      
      return `I found ${appointments.length} upcoming appointments for you. Your next appointment is ${nextApt.type} with ${nextApt.practitionerName} on ${dateStr}. Would you like me to help you with this appointment or would you prefer to hear about all your appointments?`;
    }
  }

  /**
   * Handle case when no appointments found
   */
  private async handleNoAppointmentsFound(request: AppointmentLookupRequest): Promise<AppointmentLookupResponse> {
    if (request.confirmationNumber) {
      return {
        success: false,
        message: "I couldn't find an appointment with that confirmation number. Please check the number and try again, or I can look up your appointment using your phone number instead.",
        error: 'Confirmation number not found'
      };
    } else if (request.phoneNumber) {
      return {
        success: false,
        message: "I couldn't find any appointments for that phone number. The number might not be in our system, or you might not have any upcoming appointments. Would you like to schedule a new appointment?",
        error: 'No appointments for phone number'
      };
    } else {
      return {
        success: false,
        message: "I couldn't find any appointments for that patient ID. Would you like to try with your confirmation number or phone number instead?",
        error: 'No appointments for patient ID'
      };
    }
  }

  /**
   * Store appointments for verification session
   */
  private async storeAppointmentsForVerification(
    conversationId: string, 
    appointments: AppointmentDetails[]
  ): Promise<void> {
    const key = `verification:appointments:${conversationId}`;
    await this.redis.setex(key, 300, JSON.stringify(appointments)); // 5 minute expiry
    
    // Initialize verification status
    const verification: AppointmentVerification = {
      method: 'phone_dob',
      verified: false,
      attempts: 0,
      maxAttempts: 3
    };
    
    const verificationKey = `verification:status:${conversationId}`;
    await this.redis.setex(verificationKey, 300, JSON.stringify(verification));
  }

  /**
   * Get stored appointments for verification
   */
  private async getStoredAppointmentsForVerification(conversationId: string): Promise<AppointmentDetails[] | null> {
    const key = `verification:appointments:${conversationId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get verification status
   */
  private async getVerificationStatus(conversationId: string): Promise<AppointmentVerification | null> {
    const key = `verification:status:${conversationId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update verification status
   */
  private async updateVerificationStatus(
    conversationId: string, 
    verification: AppointmentVerification
  ): Promise<void> {
    const key = `verification:status:${conversationId}`;
    await this.redis.setex(key, 300, JSON.stringify(verification));
  }

  /**
   * Clear verification session
   */
  private async clearVerificationSession(conversationId: string): Promise<void> {
    await this.redis.del(`verification:appointments:${conversationId}`);
    await this.redis.del(`verification:status:${conversationId}`);
  }

  /**
   * Perform verification check
   */
  private async performVerification(
    appointments: AppointmentDetails[], 
    verificationData: Partial<AppointmentVerification>
  ): Promise<boolean> {
    // Get patient details from first appointment
    const patientId = appointments[0].patientId;
    const patient = await this.openemrClient.getPatientDetails(patientId);
    
    if (!patient) {
      return false;
    }

    // Check provided verification data against patient record
    if (verificationData.phoneNumber) {
      const normalizedProvided = this.normalizePhoneNumber(verificationData.phoneNumber);
      const normalizedStored = this.normalizePhoneNumber(patient.phoneNumber);
      return normalizedProvided === normalizedStored;
    }
    
    if (verificationData.dateOfBirth) {
      const providedDate = new Date(verificationData.dateOfBirth);
      const storedDate = new Date(patient.dateOfBirth);
      return providedDate.toDateString() === storedDate.toDateString();
    }
    
    if (verificationData.lastName) {
      return verificationData.lastName.toLowerCase() === patient.lastName.toLowerCase();
    }
    
    return false;
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhoneNumber(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10); // Keep last 10 digits
  }

  /**
   * Get default date range (next 30 days)
   */
  private getDefaultDateRange(): { start: string; end: string } {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 30);
    
    return {
      start: today.toISOString().split('T')[0],
      end: futureDate.toISOString().split('T')[0]
    };
  }
}