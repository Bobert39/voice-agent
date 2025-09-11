/**
 * OpenEMR REST API Client
 * 
 * Implements OAuth 2.0 authentication and provides methods for:
 * - Patient verification
 * - Appointment operations  
 * - Calendar data retrieval
 * - Conflict detection
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

interface Patient {
  pid: string;
  fname: string;
  lname: string;
  DOB: string;
  phone_home?: string;
  phone_cell?: string;
}

interface Appointment {
  id: string;
  patient_id: string;
  provider_id: string;
  start_date: string;
  end_date: string;
  status: string;
  appointment_type: string;
  duration: number;
}

interface AppointmentConflict {
  hasConflict: boolean;
  conflictingAppointments?: Appointment[];
  reason?: string;
}

export class OpenEMRClient {
  private config: OpenEMRConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;

  constructor(config: OpenEMRConfig) {
    this.config = {
      site: 'default',
      ...config,
      scope: config.scope || 'openid offline_access api:oemr user/patient.read user/appointment.read user/appointment.write'
    };
  }

  /**
   * OAuth 2.0 Client Registration
   * Required before any API calls
   */
  async registerClient(): Promise<{ client_id: string; client_secret: string }> {
    const registrationData = {
      application_type: 'private',
      redirect_uris: ['https://localhost:3000/callback'], // Configure for your app
      client_name: 'Voice Agent for Capitol Eye Care',
      token_endpoint_auth_method: 'client_secret_post',
      contacts: ['admin@capitoleyecare.com'],
      scope: this.config.scope
    };

    const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registrationData)
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * OAuth 2.0 Authorization Code Grant
   * Use this for production - most secure method
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: this.config.scope,
      redirect_uri: 'https://localhost:3000/callback',
      state: state || crypto.randomBytes(16).toString('hex')
    });

    return `${this.config.baseUrl}/oauth2/${this.config.site}/authorize?${params}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: redirectUri
    });

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`
      },
      body: data
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const tokens = await response.json();
    this.setTokens(tokens);
    return tokens;
  }

  /**
   * OAuth 2.0 Password Grant (DEVELOPMENT ONLY)
   * NOT recommended for production due to security implications
   */
  async authenticateWithPassword(username: string, password: string): Promise<TokenResponse> {
    const data = new URLSearchParams({
      grant_type: 'password',
      client_id: this.config.clientId,
      scope: this.config.scope,
      user_role: 'users',
      username,
      password
    });

    const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
      method: 'POST',
      headers: {
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
      await this.refreshAccessToken();
    }
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.ensureValidToken();

    const url = `${this.config.baseUrl}/apis/${this.config.site}/api${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Patient Identity Verification
   * Search for patient by name, DOB, and phone number
   */
  async verifyPatient(firstName: string, lastName: string, dob: string, phone?: string): Promise<Patient | null> {
    try {
      // Search patients by name and DOB
      const patients = await this.makeRequest<{ data: Patient[] }>('/patient');
      
      const matchingPatients = patients.data.filter(patient => {
        const nameMatch = patient.fname.toLowerCase() === firstName.toLowerCase() &&
                         patient.lname.toLowerCase() === lastName.toLowerCase();
        const dobMatch = patient.DOB === dob;
        
        let phoneMatch = true;
        if (phone) {
          phoneMatch = patient.phone_home === phone || patient.phone_cell === phone;
        }
        
        return nameMatch && dobMatch && phoneMatch;
      });

      return matchingPatients.length === 1 ? matchingPatients[0] : null;
    } catch (error) {
      console.error('Patient verification failed:', error);
      throw new Error('Unable to verify patient identity');
    }
  }

  /**
   * Get patient appointments
   */
  async getPatientAppointments(patientId: string, startDate?: string, endDate?: string): Promise<Appointment[]> {
    let endpoint = `/patient/${patientId}/appointment`;
    
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      endpoint += `?${params}`;
    }

    const response = await this.makeRequest<{ data: Appointment[] }>(endpoint);
    return response.data;
  }

  /**
   * Get available appointment slots
   */
  async getAvailableSlots(providerId: string, date: string, duration: number = 30): Promise<string[]> {
    // This would typically require custom OpenEMR endpoint or calculation
    // For now, return mock available slots
    const appointments = await this.makeRequest<{ data: Appointment[] }>('/appointment');
    const dayAppointments = appointments.data.filter(apt => 
      apt.provider_id === providerId && 
      apt.start_date.startsWith(date)
    );

    // Generate available slots (simplified logic)
    const slots: string[] = [];
    const startHour = 8; // 8 AM
    const endHour = 17;  // 5 PM
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const timeSlot = `${date} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
        
        // Check if slot is available
        const isOccupied = dayAppointments.some(apt => {
          const aptStart = new Date(apt.start_date);
          const aptEnd = new Date(apt.end_date);
          const slotTime = new Date(timeSlot);
          
          return slotTime >= aptStart && slotTime < aptEnd;
        });
        
        if (!isOccupied) {
          slots.push(timeSlot);
        }
      }
    }
    
    return slots;
  }

  /**
   * Check for appointment conflicts
   */
  async checkAppointmentConflict(
    providerId: string, 
    startDate: string, 
    duration: number,
    excludeAppointmentId?: string
  ): Promise<AppointmentConflict> {
    const endDate = new Date(new Date(startDate).getTime() + duration * 60000).toISOString();
    
    const appointments = await this.makeRequest<{ data: Appointment[] }>('/appointment');
    const conflicts = appointments.data.filter(apt => {
      // Skip the appointment we're updating
      if (excludeAppointmentId && apt.id === excludeAppointmentId) {
        return false;
      }
      
      // Check provider conflict
      if (apt.provider_id !== providerId) {
        return false;
      }
      
      // Check time overlap
      const aptStart = new Date(apt.start_date);
      const aptEnd = new Date(apt.end_date);
      const newStart = new Date(startDate);
      const newEnd = new Date(endDate);
      
      return (newStart < aptEnd && newEnd > aptStart);
    });

    return {
      hasConflict: conflicts.length > 0,
      conflictingAppointments: conflicts,
      reason: conflicts.length > 0 ? 'Provider has conflicting appointment' : undefined
    };
  }

  /**
   * Create new appointment
   */
  async createAppointment(appointmentData: {
    patient_id: string;
    provider_id: string;
    start_date: string;
    duration: number;
    appointment_type: string;
    reason?: string;
  }): Promise<Appointment> {
    // Check for conflicts first
    const conflict = await this.checkAppointmentConflict(
      appointmentData.provider_id,
      appointmentData.start_date,
      appointmentData.duration
    );

    if (conflict.hasConflict) {
      throw new Error('Appointment time conflicts with existing booking');
    }

    const endDate = new Date(
      new Date(appointmentData.start_date).getTime() + appointmentData.duration * 60000
    ).toISOString();

    const newAppointment = {
      ...appointmentData,
      end_date: endDate,
      status: 'scheduled'
    };

    const response = await this.makeRequest<{ data: Appointment }>('/appointment', {
      method: 'POST',
      body: JSON.stringify(newAppointment)
    });

    return response.data;
  }

  /**
   * Update existing appointment
   */
  async updateAppointment(appointmentId: string, updates: Partial<Appointment>): Promise<Appointment> {
    if (updates.start_date && updates.duration) {
      // Check for conflicts when changing time
      const conflict = await this.checkAppointmentConflict(
        updates.provider_id!,
        updates.start_date,
        updates.duration,
        appointmentId
      );

      if (conflict.hasConflict) {
        throw new Error('Updated appointment time conflicts with existing booking');
      }

      // Update end date if start date or duration changed
      updates.end_date = new Date(
        new Date(updates.start_date).getTime() + updates.duration * 60000
      ).toISOString();
    }

    const response = await this.makeRequest<{ data: Appointment }>(`/appointment/${appointmentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    return response.data;
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    await this.updateAppointment(appointmentId, {
      status: 'cancelled',
      reason
    });
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.ensureValidToken();
      await this.makeRequest('/patient?limit=1');
      return { success: true, message: 'OpenEMR API connection successful' };
    } catch (error) {
      return { 
        success: false, 
        message: `OpenEMR API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
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