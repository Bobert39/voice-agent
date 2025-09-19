/**
 * OpenEMR REST API Client for Patient Verification Service
 * 
 * Implements OAuth 2.0 authentication and provides methods for:
 * - Patient identity verification
 * - HIPAA-compliant patient lookup
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

export interface Patient {
  pid: string;
  fname: string;
  lname: string;
  DOB: string;
  phone_home?: string;
  phone_cell?: string;
  email?: string;
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
      scope: config.scope || 'openid offline_access api:oemr user/patient.read'
    };
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
          // Normalize phone numbers for comparison (remove non-digits)
          const normalizePhone = (p: string) => p.replace(/\D/g, '');
          const normalizedInputPhone = normalizePhone(phone);
          const homeMatch = patient.phone_home && normalizePhone(patient.phone_home) === normalizedInputPhone;
          const cellMatch = patient.phone_cell && normalizePhone(patient.phone_cell) === normalizedInputPhone;
          phoneMatch = homeMatch || cellMatch;
        }
        
        return nameMatch && dobMatch && phoneMatch;
      });

      return matchingPatients.length === 1 ? (matchingPatients[0] ?? null) : null;
    } catch (error) {
      console.error('Patient verification failed:', error);
      throw new Error('Unable to verify patient identity');
    }
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

    delete this.accessToken;
    delete this.refreshToken;
    delete this.tokenExpiry;
  }
}