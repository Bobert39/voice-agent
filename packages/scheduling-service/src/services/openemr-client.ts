/**
 * OpenEMR FHIR REST API Client for Scheduling Service
 * 
 * Implements OAuth 2.0 authentication and FHIR endpoints for:
 * - Appointment slot availability queries
 * - Provider schedule management
 * - Calendar synchronization
 */

import crypto from 'crypto';

interface OpenEMRConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  site?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

export interface Practitioner {
  id: string;
  name: string;
  specialty?: string;
  identifier?: string;
}

export interface AppointmentSlot {
  id: string;
  start: string;
  end: string;
  status: 'busy' | 'free' | 'busy-unavailable' | 'busy-tentative' | 'entered-in-error';
  schedule?: string;
  appointmentType?: string;
  operatingHours?: {
    daysOfWeek?: string[];
    allDay?: boolean;
    openingTime?: string;
    closingTime?: string;
  };
}

export interface Appointment {
  id: string;
  status: 'proposed' | 'pending' | 'booked' | 'arrived' | 'fulfilled' | 'cancelled' | 'noshow';
  appointmentType?: {
    coding: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  start: string;
  end: string;
  participant?: Array<{
    actor?: {
      reference?: string;
      display?: string;
    };
    status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  }>;
  description?: string;
}

export class OpenEMRSchedulingClient {
  private config: OpenEMRConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;

  constructor(config: OpenEMRConfig) {
    this.config = {
      site: 'default',
      ...config,
      scope: config.scope || 'openid offline_access api:fhir user/Appointment.read user/Appointment.write user/Slot.read user/Practitioner.read'
    };
  }

  /**
   * OAuth 2.0 Client Credentials Grant
   * Recommended for server-to-server authentication
   */
  async authenticateWithClientCredentials(): Promise<TokenResponse> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    
    const data = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.config.scope
    });

    const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: data
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authentication failed: ${response.statusText} - ${errorText}`);
    }

    const tokens = await response.json();
    this.setTokens(tokens);
    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: this.refreshToken
    });

    const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: data
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }

    const tokens = await response.json();
    this.setTokens(tokens);
    return tokens;
  }

  /**
   * Set tokens and expiry time
   */
  private setTokens(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('No access token available. Please authenticate first.');
    }

    // Check if token is expiring soon (within 5 minutes)
    if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        // Re-authenticate with client credentials
        await this.authenticateWithClientCredentials();
      }
    }
  }

  /**
   * Make authenticated FHIR API request
   */
  private async makeFHIRRequest<T>(resource: string, options: RequestInit = {}): Promise<T> {
    await this.ensureValidToken();

    const url = `${this.config.baseUrl}/apis/${this.config.site}/fhir${resource}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FHIR API request failed: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get available appointment slots for a specific date range
   * 
   * @param startDate - ISO date string (YYYY-MM-DD)
   * @param endDate - ISO date string (YYYY-MM-DD)
   * @param practitionerId - Optional practitioner ID to filter by
   * @param appointmentType - Optional appointment type to filter by
   */
  async getAvailableSlots(
    startDate: string, 
    endDate: string,
    practitionerId?: string,
    appointmentType?: string
  ): Promise<AppointmentSlot[]> {
    try {
      let query = `/Slot?start=ge${startDate}&start=le${endDate}&status=free`;
      
      if (practitionerId) {
        query += `&schedule.actor=Practitioner/${practitionerId}`;
      }

      if (appointmentType) {
        query += `&appointment-type=${appointmentType}`;
      }

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{
          resource: any;
        }>;
      }>(query);

      if (!response.entry) {
        return [];
      }

      return response.entry.map(entry => {
        const slot = entry.resource;
        return {
          id: slot.id,
          start: slot.start,
          end: slot.end,
          status: slot.status,
          schedule: slot.schedule?.reference,
          appointmentType: slot.appointmentType?.coding?.[0]?.display,
          operatingHours: slot.operatingHours
        };
      });
    } catch (error) {
      console.error('Failed to get available slots:', error);
      throw new Error('Unable to retrieve appointment availability');
    }
  }

  /**
   * Get appointments for a specific date range
   */
  async getAppointments(
    startDate: string,
    endDate: string,
    practitionerId?: string,
    patientId?: string
  ): Promise<Appointment[]> {
    try {
      let query = `/Appointment?date=ge${startDate}&date=le${endDate}`;
      
      if (practitionerId) {
        query += `&practitioner=Practitioner/${practitionerId}`;
      }

      if (patientId) {
        query += `&patient=Patient/${patientId}`;
      }

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{
          resource: any;
        }>;
      }>(query);

      if (!response.entry) {
        return [];
      }

      return response.entry.map(entry => {
        const appointment = entry.resource;
        return {
          id: appointment.id,
          status: appointment.status,
          appointmentType: appointment.appointmentType,
          start: appointment.start,
          end: appointment.end,
          participant: appointment.participant,
          description: appointment.description
        };
      });
    } catch (error) {
      console.error('Failed to get appointments:', error);
      throw new Error('Unable to retrieve appointments');
    }
  }

  /**
   * Get all practitioners
   */
  async getPractitioners(): Promise<Practitioner[]> {
    try {
      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{
          resource: any;
        }>;
      }>('/Practitioner');

      if (!response.entry) {
        return [];
      }

      return response.entry.map(entry => {
        const practitioner = entry.resource;
        const name = practitioner.name?.[0];
        const displayName = name ? 
          `${name.prefix?.join(' ') || ''} ${name.given?.join(' ') || ''} ${name.family || ''}`.trim() : 
          'Unknown Practitioner';

        return {
          id: practitioner.id,
          name: displayName,
          specialty: practitioner.qualification?.[0]?.code?.coding?.[0]?.display,
          identifier: practitioner.identifier?.[0]?.value
        };
      });
    } catch (error) {
      console.error('Failed to get practitioners:', error);
      throw new Error('Unable to retrieve practitioners');
    }
  }

  /**
   * Create a new appointment
   */
  async createAppointment(appointmentData: {
    start: string;
    end: string;
    patientId: string;
    practitionerId: string;
    appointmentType?: string;
    description?: string;
  }): Promise<Appointment> {
    const fhirAppointment = {
      resourceType: 'Appointment',
      status: 'proposed',
      appointmentType: appointmentData.appointmentType ? {
        coding: [{
          display: appointmentData.appointmentType
        }]
      } : undefined,
      start: appointmentData.start,
      end: appointmentData.end,
      participant: [
        {
          actor: {
            reference: `Patient/${appointmentData.patientId}`
          },
          status: 'needs-action'
        },
        {
          actor: {
            reference: `Practitioner/${appointmentData.practitionerId}`
          },
          status: 'needs-action'
        }
      ],
      description: appointmentData.description
    };

    try {
      const response = await this.makeFHIRRequest<any>('/Appointment', {
        method: 'POST',
        body: JSON.stringify(fhirAppointment)
      });

      return {
        id: response.id,
        status: response.status,
        appointmentType: response.appointmentType,
        start: response.start,
        end: response.end,
        participant: response.participant,
        description: response.description
      };
    } catch (error) {
      console.error('Failed to create appointment:', error);
      throw new Error('Unable to create appointment');
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    const cancelData = {
      resourceType: 'Appointment',
      id: appointmentId,
      status: 'cancelled',
      cancelationReason: reason ? {
        text: reason
      } : undefined
    };

    try {
      await this.makeFHIRRequest(`/Appointment/${appointmentId}`, {
        method: 'PUT',
        body: JSON.stringify(cancelData)
      });
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
      throw new Error('Unable to cancel appointment');
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.ensureValidToken();
      await this.makeFHIRRequest('/metadata');
      return { success: true, message: 'OpenEMR FHIR API connection successful' };
    } catch (error) {
      return { 
        success: false, 
        message: `OpenEMR FHIR API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Search appointments by various criteria
   * Story 3.3: Support multiple lookup methods
   */
  async searchAppointments(criteria: {
    confirmationNumber?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    try {
      let query = '/Appointment?';
      const params: string[] = [];

      if (criteria.confirmationNumber) {
        // Search by confirmation number in appointment identifier
        params.push(`identifier=${criteria.confirmationNumber}`);
      }

      if (criteria.patientId) {
        params.push(`patient=Patient/${criteria.patientId}`);
      }

      if (criteria.startDate) {
        params.push(`date=ge${criteria.startDate}`);
      }

      if (criteria.endDate) {
        params.push(`date=le${criteria.endDate}`);
      }

      query += params.join('&');

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{ resource: any }>;
      }>(query);

      if (!response.entry) {
        return [];
      }

      return response.entry.map(entry => this.mapFhirAppointmentToDetails(entry.resource));
    } catch (error) {
      console.error('Failed to search appointments:', error);
      throw new Error('Unable to search appointments');
    }
  }

  /**
   * Search patients by phone number
   * Story 3.3: Support phone number lookup
   */
  async searchPatientsByPhone(phoneNumber: string): Promise<any[]> {
    try {
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const query = `/Patient?telecom=${normalizedPhone}`;

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{ resource: any }>;
      }>(query);

      if (!response.entry) {
        return [];
      }

      return response.entry.map(entry => ({
        id: entry.resource.id,
        name: this.formatPatientName(entry.resource.name),
        phoneNumber: this.extractPhoneNumber(entry.resource.telecom),
        dateOfBirth: entry.resource.birthDate
      }));
    } catch (error) {
      console.error('Failed to search patients by phone:', error);
      throw new Error('Unable to search patients by phone number');
    }
  }

  /**
   * Get patient details for verification
   * Story 3.3: Support patient verification
   */
  async getPatientDetails(patientId: string): Promise<any | null> {
    try {
      const response = await this.makeFHIRRequest<any>(`/Patient/${patientId}`);
      
      return {
        id: response.id,
        firstName: response.name?.[0]?.given?.[0] || '',
        lastName: response.name?.[0]?.family || '',
        dateOfBirth: response.birthDate,
        phoneNumber: this.extractPhoneNumber(response.telecom)
      };
    } catch (error) {
      console.error('Failed to get patient details:', error);
      return null;
    }
  }

  /**
   * Update an existing appointment
   * Story 3.3: Support appointment modifications
   */
  async updateAppointment(appointmentId: string, updateData: {
    start?: string;
    end?: string;
    practitionerId?: string;
    appointmentType?: string;
    duration?: number;
    reason?: string;
  }): Promise<any> {
    try {
      // First get the existing appointment
      const existing = await this.makeFHIRRequest<any>(`/Appointment/${appointmentId}`);
      
      // Build the updated appointment
      const updatedAppointment = {
        ...existing,
        start: updateData.start || existing.start,
        end: updateData.end || existing.end,
        appointmentType: updateData.appointmentType ? {
          coding: [{ display: updateData.appointmentType }]
        } : existing.appointmentType,
        reason: updateData.reason ? [{
          text: updateData.reason
        }] : existing.reason
      };

      // Update practitioner if provided
      if (updateData.practitionerId) {
        const practitionerParticipant = updatedAppointment.participant?.find(
          (p: any) => p.actor?.reference?.startsWith('Practitioner/')
        );
        if (practitionerParticipant) {
          practitionerParticipant.actor.reference = `Practitioner/${updateData.practitionerId}`;
        }
      }

      // Calculate new end time if duration provided
      if (updateData.duration && updateData.start) {
        const startTime = new Date(updateData.start);
        const endTime = new Date(startTime.getTime() + updateData.duration * 60000);
        updatedAppointment.end = endTime.toISOString();
      }

      const response = await this.makeFHIRRequest<any>(`/Appointment/${appointmentId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedAppointment)
      });

      return this.mapFhirAppointmentToDetails(response);
    } catch (error) {
      console.error('Failed to update appointment:', error);
      throw new Error('Unable to update appointment');
    }
  }

  /**
   * Check if a specific slot is still available
   * Story 3.3: Support conflict detection
   */
  async checkSlotAvailability(
    dateTime: string,
    practitionerId: string,
    duration: number
  ): Promise<{ available: boolean; conflicts?: string[] }> {
    try {
      const startTime = new Date(dateTime);
      const endTime = new Date(startTime.getTime() + duration * 60000);
      
      const query = `/Appointment?practitioner=Practitioner/${practitionerId}&date=ge${startTime.toISOString()}&date=le${endTime.toISOString()}&status:not=cancelled`;

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{ resource: any }>;
      }>(query);

      const conflicts = response.entry?.map(entry => 
        `Existing appointment from ${entry.resource.start} to ${entry.resource.end}`
      ) || [];

      return {
        available: conflicts.length === 0,
        conflicts: conflicts.length > 0 ? conflicts : undefined
      };
    } catch (error) {
      console.error('Failed to check slot availability:', error);
      return { available: false, conflicts: ['Unable to verify availability'] };
    }
  }

  /**
   * Map FHIR appointment to internal format
   */
  private mapFhirAppointmentToDetails(fhirAppointment: any): any {
    const practitionerParticipant = fhirAppointment.participant?.find(
      (p: any) => p.actor?.reference?.startsWith('Practitioner/')
    );
    const patientParticipant = fhirAppointment.participant?.find(
      (p: any) => p.actor?.reference?.startsWith('Patient/')
    );

    return {
      id: fhirAppointment.id,
      patientId: patientParticipant?.actor?.reference?.replace('Patient/', '') || '',
      patientName: patientParticipant?.actor?.display || '',
      practitionerId: practitionerParticipant?.actor?.reference?.replace('Practitioner/', '') || '',
      practitionerName: practitionerParticipant?.actor?.display || '',
      datetime: fhirAppointment.start,
      duration: this.calculateDurationMinutes(fhirAppointment.start, fhirAppointment.end),
      type: fhirAppointment.appointmentType?.coding?.[0]?.display || 'routine',
      status: fhirAppointment.status,
      reason: fhirAppointment.reason?.[0]?.text || fhirAppointment.description,
      confirmationNumber: fhirAppointment.identifier?.[0]?.value || this.generateConfirmationNumber()
    };
  }

  /**
   * Format patient name from FHIR format
   */
  private formatPatientName(nameArray: any[]): string {
    if (!nameArray || nameArray.length === 0) return 'Unknown Patient';
    
    const name = nameArray[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim();
  }

  /**
   * Extract phone number from FHIR telecom array
   */
  private extractPhoneNumber(telecomArray: any[]): string {
    if (!telecomArray) return '';
    
    const phoneEntry = telecomArray.find(t => t.system === 'phone');
    return phoneEntry?.value || '';
  }

  /**
   * Calculate duration in minutes between two ISO datetime strings
   */
  private calculateDurationMinutes(start: string, end: string): number {
    const startTime = new Date(start);
    const endTime = new Date(end);
    return Math.round((endTime.getTime() - startTime.getTime()) / 60000);
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
   * Logout and revoke tokens
   */
  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
      } catch (error) {
        console.warn('Logout request failed:', error);
      }
    }

    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.tokenExpiry = undefined;
  }
}