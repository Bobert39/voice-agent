/**
 * Enhanced OpenEMR FHIR REST API Client for Scheduling Service
 *
 * Story 1.3: OpenEMR Connectivity Validation
 *
 * Implements:
 * - OAuth 2.0 Authorization Code Grant with PKCE
 * - Client Credentials Grant for server-to-server
 * - Automatic token refresh with secure storage
 * - Circuit breaker pattern for resilience
 * - Retry logic with exponential backoff
 * - Rate limiting (10 requests/second)
 * - Comprehensive error handling
 */

import * as crypto from 'crypto';
// Simple logger for enhanced OpenEMR client
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args)
};

// Configuration interfaces
interface OpenEMRConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  scope?: string;
  site?: string;
  maxRetries?: number;
  rateLimitPerSecond?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

// Circuit breaker states
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

// Rate limiter
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerSecond: number;

  constructor(maxRequestsPerSecond: number = 10) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Remove requests older than 1 second
    this.requests = this.requests.filter(time => time > oneSecondAgo);

    if (this.requests.length >= this.maxRequestsPerSecond) {
      const oldestRequest = this.requests[0];
      if (oldestRequest) {
        const waitTime = 1000 - (now - oldestRequest);
        if (waitTime > 0) {
          await this.sleep(waitTime);
        }
      }
    }

    this.requests.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: Date;
  private successCount: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      resetTimeout: config?.resetTimeout || 60000, // 60 seconds
      halfOpenRequests: config?.halfOpenRequests || 3
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        logger.info('Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime.getTime() >= this.config.resetTimeout;
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker closed - service recovered');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened - too many failures');
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker reopened - failure in half-open state');
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Export interfaces
export interface Practitioner {
  id: string;
  name: string;
  specialty?: string;
  identifier?: string;
  schedule?: string;
}

export interface AppointmentSlot {
  id: string;
  start: string;
  end: string;
  status: 'busy' | 'free' | 'busy-unavailable' | 'busy-tentative' | 'entered-in-error';
  schedule?: string;
  practitioner?: string;
  appointmentType?: string;
  duration?: number;
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
  duration?: number;
  participant?: Array<{
    actor?: {
      reference?: string;
      display?: string;
    };
    status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  }>;
  description?: string;
  identifier?: Array<{
    system?: string;
    value?: string;
  }>;
}

export interface ConflictCheckResult {
  available: boolean;
  conflicts?: string[];
  suggestions?: AppointmentSlot[];
}

// Main client class
export class EnhancedOpenEMRClient {
  private config: OpenEMRConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private pkceChallenge?: PKCEChallenge;

  constructor(config: OpenEMRConfig) {
    this.config = {
      site: 'default',
      maxRetries: 3,
      rateLimitPerSecond: 10,
      ...config,
      scope: config.scope || 'openid offline_access api:fhir user/Appointment.read user/Appointment.write user/Slot.read user/Practitioner.read user/Patient.read'
    };

    this.rateLimiter = new RateLimiter(this.config.rateLimitPerSecond);
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Generate PKCE challenge for OAuth 2.0 Authorization Code Grant
   */
  generatePKCEChallenge(): PKCEChallenge {
    const codeVerifier = this.generateRandomString(128);
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash.toString('base64url');
    const state = this.generateRandomString(32);

    this.pkceChallenge = {
      codeVerifier,
      codeChallenge,
      state
    };

    return this.pkceChallenge;
  }

  /**
   * Get authorization URL for OAuth 2.0 Authorization Code Grant with PKCE
   */
  getAuthorizationUrl(): string {
    if (!this.config.redirectUri) {
      throw new Error('Redirect URI is required for authorization code grant');
    }

    const challenge = this.generatePKCEChallenge();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope!,
      state: challenge.state,
      code_challenge: challenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${this.config.baseUrl}/oauth2/${this.config.site}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens (OAuth 2.0 Authorization Code Grant)
   */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
    if (!this.pkceChallenge || this.pkceChallenge.state !== state) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    const data = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri!,
      code_verifier: this.pkceChallenge.codeVerifier
    });

    const response = await this.makeTokenRequest(data);
    this.setTokens(response);
    this.pkceChallenge = undefined; // Clear PKCE challenge after use

    logger.info('Successfully exchanged authorization code for tokens');
    return response;
  }

  /**
   * OAuth 2.0 Client Credentials Grant (server-to-server)
   */
  async authenticateWithClientCredentials(): Promise<TokenResponse> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const data = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.config.scope!
    });

    const response = await this.makeTokenRequest(data, {
      'Authorization': `Basic ${credentials}`
    });

    this.setTokens(response);
    logger.info('Successfully authenticated with client credentials');
    return response;
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
      client_secret: this.config.clientSecret,
      refresh_token: this.refreshToken
    });

    try {
      const response = await this.makeTokenRequest(data);
      this.setTokens(response);
      logger.info('Successfully refreshed access token');
      return response;
    } catch (error) {
      // If refresh fails, clear tokens and re-authenticate
      this.clearTokens();
      throw new Error('Token refresh failed - re-authentication required');
    }
  }

  /**
   * Make token request with retry logic
   */
  private async makeTokenRequest(data: URLSearchParams, additionalHeaders?: Record<string, string>): Promise<TokenResponse> {
    return this.executeWithRetry(async () => {
      await this.rateLimiter.throttle();

      const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...additionalHeaders
        },
        body: data
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`Token request failed: ${response.status} - ${errorText}`);
        error.status = response.status;
        throw error;
      }

      return await response.json() as TokenResponse;
    });
  }

  /**
   * Set tokens and expiry time
   */
  private setTokens(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;

    // Set expiry to 5 minutes before actual expiry for safety
    const expiryMs = (tokens.expires_in - 300) * 1000;
    this.tokenExpiry = new Date(Date.now() + expiryMs);
  }

  /**
   * Clear all tokens
   */
  private clearTokens(): void {
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.tokenExpiry = undefined;
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      // Try to authenticate with client credentials if no token
      await this.authenticateWithClientCredentials();
      return;
    }

    // Check if token is expired or expiring soon
    if (this.tokenExpiry && this.tokenExpiry.getTime() <= Date.now()) {
      if (this.refreshToken) {
        try {
          await this.refreshAccessToken();
        } catch (error) {
          // If refresh fails, try client credentials
          await this.authenticateWithClientCredentials();
        }
      } else {
        await this.authenticateWithClientCredentials();
      }
    }
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.config.maxRetries!
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.circuitBreaker.execute(operation);
      } catch (error: any) {
        lastError = error;
        logger.warn(`Operation failed (attempt ${attempt}/${retries}): ${error.message}`);

        // Don't retry on client errors (4xx) except 401 and 429
        if (error.status && error.status >= 400 && error.status < 500) {
          if (error.status !== 401 && error.status !== 429) {
            throw error;
          }
        }

        // Handle 401 - try to refresh token
        if (error.status === 401 && attempt < retries) {
          try {
            await this.refreshAccessToken();
            continue; // Retry immediately after refresh
          } catch (refreshError) {
            logger.error('Token refresh failed:', refreshError);
          }
        }

        // Exponential backoff for retryable errors
        if (attempt < retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          logger.info(`Retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Make authenticated FHIR API request
   */
  private async makeFHIRRequest<T>(
    resource: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureValidToken();

    return await this.executeWithRetry(async () => {
      await this.rateLimiter.throttle();

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
        const error: any = new Error(`FHIR API request failed: ${response.status} - ${errorText}`);
        error.status = response.status;
        throw error;
      }

      return await response.json() as T;
    }) as Promise<T>;
  }

  /**
   * Make authenticated Standard API request
   */
  private async makeStandardAPIRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.ensureValidToken();

    return await this.executeWithRetry(async () => {
      await this.rateLimiter.throttle();

      const url = `${this.config.baseUrl}/apis/${this.config.site}/api${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error: any = new Error(`Standard API request failed: ${response.status} - ${errorText}`);
        error.status = response.status;
        throw error;
      }

      return await response.json() as T;
    }) as Promise<T>;
  }

  /**
   * Get available appointment slots with conflict detection
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
        entry?: Array<{ resource: any }>;
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
          practitioner: this.extractPractitionerFromSchedule(slot.schedule?.reference),
          appointmentType: slot.appointmentType?.coding?.[0]?.display,
          duration: this.calculateDurationMinutes(slot.start, slot.end)
        };
      });
    } catch (error) {
      logger.error('Failed to get available slots:', error);
      throw new Error('Unable to retrieve appointment availability');
    }
  }

  /**
   * Create appointment with validation
   */
  async createAppointment(appointmentData: {
    start: string;
    end: string;
    patientId: string;
    practitionerId: string;
    appointmentType?: string;
    description?: string;
  }): Promise<Appointment> {
    // Validate appointment doesn't conflict
    const conflictCheck = await this.checkSlotAvailability(
      appointmentData.start,
      appointmentData.practitionerId,
      this.calculateDurationMinutes(appointmentData.start, appointmentData.end)
    );

    if (!conflictCheck.available) {
      throw new Error(`Appointment conflict detected: ${conflictCheck.conflicts?.join(', ')}`);
    }

    // Validate business rules
    this.validateBusinessRules(appointmentData);

    const fhirAppointment = {
      resourceType: 'Appointment',
      status: 'proposed',
      identifier: [{
        system: 'https://capitol-eye-care.com/appointment',
        value: this.generateConfirmationNumber()
      }],
      appointmentType: appointmentData.appointmentType ? {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
          code: this.mapAppointmentTypeToCode(appointmentData.appointmentType),
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
          status: 'accepted'
        }
      ],
      description: appointmentData.description
    };

    try {
      const response = await this.makeFHIRRequest<any>('/Appointment', {
        method: 'POST',
        body: JSON.stringify(fhirAppointment)
      });

      logger.info(`Created appointment ${response.id} for patient ${appointmentData.patientId}`);

      return this.mapFHIRToAppointment(response);
    } catch (error) {
      logger.error('Failed to create appointment:', error);
      throw new Error('Unable to create appointment');
    }
  }

  /**
   * Update appointment with conflict detection
   */
  async updateAppointment(
    appointmentId: string,
    updateData: {
      start?: string;
      end?: string;
      practitionerId?: string;
      appointmentType?: string;
      status?: string;
    }
  ): Promise<Appointment> {
    try {
      // Get existing appointment
      const existing = await this.makeFHIRRequest<any>(`/Appointment/${appointmentId}`);

      // Check for conflicts if time is changing
      if (updateData.start && updateData.start !== existing.start) {
        const duration = updateData.end ?
          this.calculateDurationMinutes(updateData.start, updateData.end) :
          this.calculateDurationMinutes(existing.start, existing.end);

        const practitionerId = updateData.practitionerId ||
          this.extractPractitionerFromParticipants(existing.participant);

        const conflictCheck = await this.checkSlotAvailability(
          updateData.start,
          practitionerId,
          duration,
          appointmentId // Exclude current appointment from conflict check
        );

        if (!conflictCheck.available) {
          throw new Error(`Update would create conflict: ${conflictCheck.conflicts?.join(', ')}`);
        }
      }

      // Build updated appointment
      const updatedAppointment = {
        ...existing,
        start: updateData.start || existing.start,
        end: updateData.end || existing.end,
        status: updateData.status || existing.status
      };

      if (updateData.appointmentType) {
        updatedAppointment.appointmentType = {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: this.mapAppointmentTypeToCode(updateData.appointmentType),
            display: updateData.appointmentType
          }]
        };
      }

      if (updateData.practitionerId) {
        const practitionerParticipant = updatedAppointment.participant?.find(
          (p: any) => p.actor?.reference?.startsWith('Practitioner/')
        );
        if (practitionerParticipant) {
          practitionerParticipant.actor.reference = `Practitioner/${updateData.practitionerId}`;
        }
      }

      const response = await this.makeFHIRRequest<any>(`/Appointment/${appointmentId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedAppointment)
      });

      logger.info(`Updated appointment ${appointmentId}`);
      return this.mapFHIRToAppointment(response);
    } catch (error) {
      logger.error('Failed to update appointment:', error);
      if (error instanceof Error && error.message.includes('Update would create conflict')) {
        throw error;
      }
      throw new Error('Unable to update appointment');
    }
  }

  /**
   * Delete/Cancel appointment
   */
  async deleteAppointment(appointmentId: string, reason?: string): Promise<void> {
    try {
      // Use Standard API for deletion
      await this.makeStandardAPIRequest(`/appointment/${appointmentId}`, {
        method: 'DELETE'
      });

      logger.info(`Deleted appointment ${appointmentId}`);
    } catch (error) {
      // If Standard API fails, try updating status to cancelled via FHIR
      logger.warn('Standard API deletion failed, attempting FHIR cancellation');

      const cancelData = {
        resourceType: 'Appointment',
        id: appointmentId,
        status: 'cancelled',
        cancelationReason: reason ? { text: reason } : undefined
      };

      await this.makeFHIRRequest(`/Appointment/${appointmentId}`, {
        method: 'PUT',
        body: JSON.stringify(cancelData)
      });

      logger.info(`Cancelled appointment ${appointmentId}`);
    }
  }

  /**
   * Check slot availability and detect conflicts
   */
  async checkSlotAvailability(
    dateTime: string,
    practitionerId: string,
    duration: number,
    excludeAppointmentId?: string
  ): Promise<ConflictCheckResult> {
    try {
      const startTime = new Date(dateTime);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      // Query existing appointments for the practitioner in the time range
      let query = `/Appointment?practitioner=Practitioner/${practitionerId}`;
      query += `&date=ge${startTime.toISOString()}`;
      query += `&date=le${endTime.toISOString()}`;
      query += `&status:not=cancelled`;

      const response = await this.makeFHIRRequest<{
        resourceType: 'Bundle';
        entry?: Array<{ resource: any }>;
      }>(query);

      const conflicts: string[] = [];
      const conflictingAppointments = response.entry?.filter(entry => {
        // Exclude the appointment being updated
        if (excludeAppointmentId && entry.resource.id === excludeAppointmentId) {
          return false;
        }

        const apptStart = new Date(entry.resource.start);
        const apptEnd = new Date(entry.resource.end);

        // Check for overlap
        return (startTime < apptEnd && endTime > apptStart);
      }) || [];

      conflictingAppointments.forEach(entry => {
        conflicts.push(
          `Conflict with appointment from ${entry.resource.start} to ${entry.resource.end}`
        );
      });

      // Get alternative slots if there are conflicts
      let suggestions: AppointmentSlot[] = [];
      if (conflicts.length > 0) {
        // Look for available slots in the next 7 days
        const searchEnd = new Date(startTime);
        searchEnd.setDate(searchEnd.getDate() + 7);

        suggestions = await this.getAvailableSlots(
          startTime.toISOString().split('T')[0] as string,
          searchEnd.toISOString().split('T')[0] as string,
          practitionerId
        );

        // Filter to slots that match the required duration
        suggestions = suggestions.filter(slot =>
          slot.duration && slot.duration >= duration
        ).slice(0, 5); // Limit to 5 suggestions
      }

      return {
        available: conflicts.length === 0,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };
    } catch (error) {
      logger.error('Failed to check slot availability:', error);
      return {
        available: false,
        conflicts: ['Unable to verify availability - please try again']
      };
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // First ensure we have a token
      await this.ensureValidToken();

      // Test FHIR metadata endpoint
      const metadata = await this.makeFHIRRequest('/metadata');

      // Test a simple query to verify read access
      await this.makeFHIRRequest('/Practitioner?_count=1');

      return {
        success: true,
        message: 'OpenEMR API connection successful',
        details: {
          fhirVersion: (metadata as any).fhirVersion,
          serverVersion: (metadata as any).software?.version,
          circuitBreakerState: this.circuitBreaker.getState()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `OpenEMR API connection failed: ${error.message}`,
        details: {
          circuitBreakerState: this.circuitBreaker.getState(),
          error: error.message
        }
      };
    }
  }

  // Helper methods

  private generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
  }

  private mapAppointmentTypeToCode(type: string): string {
    const typeMap: Record<string, string> = {
      'routine': 'ROUTINE',
      'follow-up': 'FOLLOWUP',
      'urgent': 'URGENT',
      'consultation': 'CONSULT'
    };
    return typeMap[type.toLowerCase()] || 'ROUTINE';
  }

  private extractPractitionerFromSchedule(scheduleRef?: string): string | undefined {
    if (!scheduleRef) return undefined;
    const match = scheduleRef.match(/Practitioner\/([^/]+)/);
    return match ? match[1] : undefined;
  }

  private extractPractitionerFromParticipants(participants?: any[]): string {
    if (!participants) return '';
    const practitioner = participants.find(p =>
      p.actor?.reference?.startsWith('Practitioner/')
    );
    return practitioner?.actor?.reference?.replace('Practitioner/', '') || '';
  }

  private calculateDurationMinutes(start: string, end: string): number {
    const startTime = new Date(start);
    const endTime = new Date(end);
    return Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  }

  private generateConfirmationNumber(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `CE${timestamp}${random}`.toUpperCase();
  }

  private validateBusinessRules(appointmentData: {
    start: string;
    appointmentType?: string;
  }): void {
    const startTime = new Date(appointmentData.start);
    const now = new Date();

    // Minimum 24-hour advance booking for routine appointments
    if (appointmentData.appointmentType?.toLowerCase() === 'routine') {
      const hoursDiff = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        throw new Error('Routine appointments require at least 24 hours advance booking');
      }
    }

    // Maximum 60-day booking window
    const daysDiff = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 60) {
      throw new Error('Appointments cannot be booked more than 60 days in advance');
    }

    // Check business hours (example: 8 AM - 5 PM)
    const hours = startTime.getHours();
    if (hours < 8 || hours >= 17) {
      throw new Error('Appointments must be scheduled during business hours (8 AM - 5 PM)');
    }

    // Check weekday (Monday-Friday)
    const dayOfWeek = startTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      throw new Error('Appointments are only available Monday through Friday');
    }
  }

  private mapFHIRToAppointment(fhirAppointment: any): Appointment {
    return {
      id: fhirAppointment.id,
      status: fhirAppointment.status,
      appointmentType: fhirAppointment.appointmentType,
      start: fhirAppointment.start,
      end: fhirAppointment.end,
      duration: this.calculateDurationMinutes(fhirAppointment.start, fhirAppointment.end),
      participant: fhirAppointment.participant,
      description: fhirAppointment.description,
      identifier: fhirAppointment.identifier
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logout and revoke tokens
   */
  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await this.executeWithRetry(async () => {
          await this.rateLimiter.throttle();

          const response = await fetch(`${this.config.baseUrl}/oauth2/${this.config.site}/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          });

          if (!response.ok) {
            logger.warn('Logout request returned non-OK status');
          }
        }, 1); // Single attempt for logout
      } catch (error) {
        logger.warn('Logout request failed:', error);
      }
    }

    this.clearTokens();
    logger.info('Logged out successfully');
  }
}