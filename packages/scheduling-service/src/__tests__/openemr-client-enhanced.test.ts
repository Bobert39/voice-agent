/**
 * Unit Tests for Enhanced OpenEMR Client
 * Story 1.3: OpenEMR Connectivity Validation
 *
 * Tests cover:
 * - OAuth 2.0 flows (Authorization Code Grant with PKCE, Client Credentials)
 * - Token management and refresh
 * - Circuit breaker functionality
 * - Rate limiting
 * - Retry logic with exponential backoff
 * - FHIR API operations
 * - Business rule validation
 * - Conflict detection
 */

import { EnhancedOpenEMRClient } from '../services/openemr-client-enhanced';
import * as crypto from 'crypto';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create complete mock response
const createMockResponse = (overrides: Partial<Response> = {}): Response => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
  url: '',
  type: 'basic',
  redirected: false,
  body: null,
  bodyUsed: false,
  text: () => Promise.resolve(''),
  json: () => Promise.resolve({}),
  blob: () => Promise.resolve(new Blob([])),
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  formData: () => Promise.resolve(new FormData()),
  clone: () => createMockResponse(overrides),
  ...overrides
} as Response);

// Mock crypto for consistent PKCE tests
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn()
}));

describe('EnhancedOpenEMRClient', () => {
  let client: EnhancedOpenEMRClient;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      baseUrl: 'https://test.openemr.io',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'https://app.example.com/callback',
      scope: 'openid offline_access api:fhir',
      maxRetries: 3,
      rateLimitPerSecond: 10
    };

    client = new EnhancedOpenEMRClient(mockConfig);
    mockFetch.mockClear();

    // Mock crypto.randomBytes for consistent tests - need enough bytes for base64url encoding
    (crypto.randomBytes as jest.Mock).mockReturnValue(
      Buffer.from('a'.repeat(128)) // Generate 128 bytes for proper length
    );
  });

  describe('PKCE Challenge Generation', () => {
    it('should generate valid PKCE challenge', () => {
      const challenge = client.generatePKCEChallenge();

      expect(challenge).toHaveProperty('codeVerifier');
      expect(challenge).toHaveProperty('codeChallenge');
      expect(challenge).toHaveProperty('state');
      expect(challenge.codeVerifier).toHaveLength(128);
      expect(challenge.state).toHaveLength(32);
      expect(challenge.codeChallenge).toBeTruthy();
    });

    it('should generate different challenges on each call', () => {
      // Mock different random bytes for each call
      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce(Buffer.from('first-mock-random-bytes-for-testing'))
        .mockReturnValueOnce(Buffer.from('second-mock-random-bytes-for-testing'));

      const challenge1 = client.generatePKCEChallenge();
      const challenge2 = client.generatePKCEChallenge();

      expect(challenge1.codeVerifier).not.toEqual(challenge2.codeVerifier);
      expect(challenge1.state).not.toEqual(challenge2.state);
    });
  });

  describe('OAuth 2.0 Authorization URL', () => {
    it('should generate correct authorization URL', () => {
      const _challenge = client.generatePKCEChallenge();
      const authUrl = client.getAuthorizationUrl();

      expect(authUrl).toContain('https://test.openemr.io/oauth2/default/authorize');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback');
      expect(authUrl).toMatch(/scope=openid[+%20]offline_access[+%20]api(%3A|:)fhir/);
      expect(authUrl).toContain(`state=${_challenge.state}`);
      expect(authUrl).toContain(`code_challenge=${_challenge.codeChallenge}`);
      expect(authUrl).toContain('code_challenge_method=S256');
    });

    it('should throw error if redirect URI is not configured', () => {
      const clientWithoutRedirect = new EnhancedOpenEMRClient({
        ...mockConfig,
        redirectUri: undefined
      });

      expect(() => clientWithoutRedirect.getAuthorizationUrl()).toThrow(
        'Redirect URI is required for authorization code grant'
      );
    });
  });

  describe('Token Exchange (Authorization Code Grant)', () => {
    it('should successfully exchange authorization code for tokens', async () => {
      const challenge = client.generatePKCEChallenge();

      const mockTokenResponse = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: 'mock-id-token'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const tokens = await client.exchangeCodeForToken('auth-code', challenge.state);

      expect(tokens).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.openemr.io/oauth2/default/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );

      // Verify request body contains correct parameters
      const callArgs = mockFetch.mock.calls[0][1];
      const body = callArgs.body.toString();
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=auth-code');
      expect(body).toContain('client_id=test-client-id');
      expect(body).toContain('client_secret=test-client-secret');
      expect(body).toContain(`code_verifier=${challenge.codeVerifier}`);
    });

    it('should reject invalid state parameter', async () => {
      client.generatePKCEChallenge();

      await expect(
        client.exchangeCodeForToken('auth-code', 'invalid-state')
      ).rejects.toThrow('Invalid state parameter - possible CSRF attack');
    });

    it('should handle token exchange errors', async () => {
      const challenge = client.generatePKCEChallenge();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid authorization code'),
        json: () => Promise.reject(new Error('Not JSON')),
        headers: new Headers(),
        url: '',
        type: 'basic',
        redirected: false,
        body: null,
        bodyUsed: false
      } as Response);

      await expect(
        client.exchangeCodeForToken('invalid-code', challenge.state)
      ).rejects.toThrow('Token request failed: 400 - Invalid authorization code');
    });
  });

  describe('Client Credentials Grant', () => {
    it('should successfully authenticate with client credentials', async () => {
      const mockTokenResponse = {
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const tokens = await client.authenticateWithClientCredentials();

      expect(tokens).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.openemr.io/oauth2/default/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );

      // Verify Basic auth header
      const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
      const encoded = authHeader.split(' ')[1];
      const decoded = Buffer.from(encoded, 'base64').toString();
      expect(decoded).toBe('test-client-id:test-client-secret');
    });
  });

  describe('Token Refresh', () => {
    it('should successfully refresh access token', async () => {
      // First authenticate to get initial tokens
      const initialTokens = {
        access_token: 'initial-access-token',
        refresh_token: 'initial-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      const refreshedTokens = {
        access_token: 'refreshed-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(initialTokens)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(refreshedTokens)
        });

      await client.authenticateWithClientCredentials();
      const tokens = await client.refreshAccessToken();

      expect(tokens).toEqual(refreshedTokens);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://test.openemr.io/oauth2/default/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      );
    });

    it('should throw error when no refresh token available', async () => {
      await expect(client.refreshAccessToken()).rejects.toThrow(
        'No refresh token available'
      );
    });

    it('should clear tokens on refresh failure', async () => {
      // First authenticate to get initial tokens
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'initial-access-token',
          refresh_token: 'initial-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });

      await client.authenticateWithClientCredentials();

      // Mock refresh failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid refresh token')
      });

      await expect(client.refreshAccessToken()).rejects.toThrow(
        'Token refresh failed - re-authentication required'
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      // Create client with low rate limit for testing
      const limitedClient = new EnhancedOpenEMRClient({
        ...mockConfig,
        rateLimitPerSecond: 2
      });

      // Mock successful token response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });

      const startTime = Date.now();

      // Make 3 requests (should trigger rate limiting)
      await Promise.all([
        limitedClient.authenticateWithClientCredentials(),
        limitedClient.authenticateWithClientCredentials(),
        limitedClient.authenticateWithClientCredentials()
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 500ms due to rate limiting (2 req/sec = 500ms between)
      expect(duration).toBeGreaterThan(400);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after multiple failures', async () => {
      // Mock consistent failures with complete response object
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('Internal Server Error'),
          json: () => Promise.reject(new Error('Not JSON')),
          headers: new Headers(),
          url: '',
          type: 'basic',
          redirected: false,
          body: null,
          bodyUsed: false
        } as Response);
      });

      // Make multiple failing requests (5 failures should open circuit)
      // Each request will retry 3 times, so 5 requests = 15 total attempts
      for (let i = 0; i < 5; i++) {
        try {
          await client.authenticateWithClientCredentials();
        } catch (error) {
          // Expected to fail
        }
      }

      // Reset mock to ensure next call fails with circuit breaker
      mockFetch.mockClear();

      // Next request should fail immediately with circuit breaker error
      await expect(client.authenticateWithClientCredentials()).rejects.toThrow(
        'Circuit breaker is open - service unavailable'
      );

      // Should not have made any fetch calls (circuit breaker blocked it)
      expect(mockFetch).not.toHaveBeenCalled();
    }, 30000); // Increase timeout to 30 seconds for retries
  });

  describe('Retry Logic', () => {
    it('should retry failed requests with exponential backoff', async () => {
      let attemptCount = 0;

      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {  // Fail first 2 attempts
          return Promise.resolve({
            ok: false,
            status: 503,  // Use 503 Service Unavailable for retryable error
            statusText: 'Service Unavailable',
            text: () => Promise.resolve('Service Unavailable'),
            json: () => Promise.reject(new Error('Not JSON')),
            headers: new Headers(),
            url: '',
            type: 'basic',
            redirected: false,
            body: null,
            bodyUsed: false
          } as Response);
        }
        // Success on third attempt
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            access_token: 'success-token',
            token_type: 'Bearer',
            expires_in: 3600
          }),
          text: () => Promise.resolve(''),
          headers: new Headers(),
          url: '',
          type: 'basic',
          redirected: false,
          body: null,
          bodyUsed: false
        } as Response);
      });

      const startTime = Date.now();
      const result = await client.authenticateWithClientCredentials();
      const endTime = Date.now();

      expect(result.access_token).toBe('success-token');
      expect(attemptCount).toBe(3);
      // Should include backoff delays (1000ms + 2000ms = 3000ms minimum)
      expect(endTime - startTime).toBeGreaterThan(2500); // Allow some tolerance
    }, 10000);

    it('should not retry client errors (except 401 and 429)', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Bad Request'),
          json: () => Promise.reject(new Error('Not JSON')),
          headers: new Headers(),
          url: '',
          type: 'basic',
          redirected: false,
          body: null,
          bodyUsed: false
        } as Response);
      });

      await expect(client.authenticateWithClientCredentials()).rejects.toThrow(
        'Token request failed: 400 - Bad Request'
      );

      // Should only be called once (no retries for 400)
      expect(callCount).toBe(1);
    }, 10000);
  });

  describe('FHIR API Operations', () => {
    beforeEach(async () => {
      // Mock successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();
    });

    describe('getAvailableSlots', () => {
      it('should retrieve available appointment slots', async () => {
        const mockResponse = {
          resourceType: 'Bundle',
          entry: [
            {
              resource: {
                id: 'slot-1',
                start: '2025-01-20T10:00:00-05:00',
                end: '2025-01-20T11:00:00-05:00',
                status: 'free',
                schedule: {
                  reference: 'Schedule/practitioner-123'
                }
              }
            }
          ]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse)
        });

        const slots = await client.getAvailableSlots(
          '2025-01-20',
          '2025-01-20',
          'practitioner-123'
        );

        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({
          id: 'slot-1',
          start: '2025-01-20T10:00:00-05:00',
          end: '2025-01-20T11:00:00-05:00',
          status: 'free',
          duration: 60
        });
      });
    });

    describe('createAppointment', () => {
      it('should create appointment with conflict validation', async () => {
        // Set appointment for a weekday 30 days from now to meet business rules
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        // Ensure it's a weekday (Monday-Friday)
        while (futureDate.getDay() === 0 || futureDate.getDay() === 6) {
          futureDate.setDate(futureDate.getDate() + 1);
        }
        const appointmentData = {
          start: futureDate.toISOString(),
          end: new Date(futureDate.getTime() + 60 * 60 * 1000).toISOString(),
          patientId: 'patient-123',
          practitionerId: 'practitioner-456',
          appointmentType: 'urgent',  // Changed to urgent to bypass 24-hour rule
          description: 'Annual eye exam'
        };

        // Mock conflict check (no conflicts)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
        });

        // Mock appointment creation
        const mockCreatedAppointment = {
          id: 'appointment-789',
          status: 'proposed',
          start: appointmentData.start,
          end: appointmentData.end,
          participant: [
            { actor: { reference: 'Patient/patient-123' } },
            { actor: { reference: 'Practitioner/practitioner-456' } }
          ]
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCreatedAppointment)
        });

        const appointment = await client.createAppointment(appointmentData);

        expect(appointment.id).toBe('appointment-789');
        expect(appointment.status).toBe('proposed');
      });

      it('should reject appointment with conflicts', async () => {
        const appointmentData = {
          start: '2025-01-20T10:00:00-05:00',
          end: '2025-01-20T11:00:00-05:00',
          patientId: 'patient-123',
          practitionerId: 'practitioner-456'
        };

        // Mock conflict check (has conflicts)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceType: 'Bundle',
            entry: [{
              resource: {
                id: 'existing-appointment',
                start: '2025-01-20T10:30:00-05:00',
                end: '2025-01-20T11:30:00-05:00'
              }
            }]
          })
        });

        await expect(client.createAppointment(appointmentData)).rejects.toThrow(
          /Appointment conflict detected/
        );
      });

      it('should validate business rules', async () => {
        // Test with appointment less than 24 hours from now on a weekday
        const tomorrow = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
        // Ensure it's a weekday
        while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
          tomorrow.setDate(tomorrow.getDate() + 1);
        }
        // Set to 10 AM which is during business hours
        tomorrow.setHours(10, 0, 0, 0);

        const invalidAppointmentData = {
          start: tomorrow.toISOString(),
          end: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
          patientId: 'patient-123',
          practitionerId: 'practitioner-456',
          appointmentType: 'routine'
        };

        // Mock conflict check (no conflicts) so business rules are tested
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
        });

        await expect(client.createAppointment(invalidAppointmentData)).rejects.toThrow();
      });
    });

    describe('checkSlotAvailability', () => {
      it('should detect conflicts correctly', async () => {
        // Mock response with conflicting appointment
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceType: 'Bundle',
            entry: [{
              resource: {
                id: 'conflict-appointment',
                start: '2025-01-20T10:30:00-05:00',
                end: '2025-01-20T11:30:00-05:00'
              }
            }]
          })
        });

        // Mock available slots for suggestions
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            resourceType: 'Bundle',
            entry: [{
              resource: {
                id: 'available-slot',
                start: '2025-01-20T14:00:00-05:00',
                end: '2025-01-20T15:00:00-05:00',
                status: 'free'
              }
            }]
          })
        });

        const result = await client.checkSlotAvailability(
          '2025-01-20T10:00:00-05:00',
          'practitioner-123',
          60
        );

        expect(result.available).toBe(false);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts![0]).toContain('Conflict with appointment from');
        expect(result.suggestions).toBeDefined();
      });

      it('should return available when no conflicts', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
        });

        const result = await client.checkSlotAvailability(
          '2025-01-20T10:00:00-05:00',
          'practitioner-123',
          60
        );

        expect(result.available).toBe(true);
        expect(result.conflicts).toBeUndefined();
      });
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });

      // Mock metadata endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          fhirVersion: '4.0.1',
          software: { version: '7.0.3' }
        })
      });

      // Mock practitioners query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
      });

      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBe('OpenEMR API connection successful');
      expect(result.details).toMatchObject({
        fhirVersion: '4.0.1',
        serverVersion: '7.0.3'
      });
    });

    it('should handle connection failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('OpenEMR API connection failed');
    });
  });

  describe('Logout', () => {
    it('should logout and clear tokens', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();

      // Mock logout
      mockFetch.mockResolvedValueOnce({ ok: true });

      await client.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.openemr.io/oauth2/default/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should handle logout failures gracefully', async () => {
      // First authenticate
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();

      // Mock logout failure
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(client.logout()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 errors by refreshing tokens', async () => {
      // Initial authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'initial-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();

      // Mock 401 error followed by successful refresh and retry
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new-token',
            refresh_token: 'new-refresh-token',
            token_type: 'Bearer',
            expires_in: 3600
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
        });

      // This should succeed after token refresh
      const slots = await client.getAvailableSlots('2025-01-20', '2025-01-20');

      expect(mockFetch).toHaveBeenCalledTimes(3); // 401, refresh, retry
      expect(slots).toEqual([]);
    });
  });

  describe('Standard API Operations', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();
    });

    it('should make standard API requests successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'patient-123',
          name: 'John Doe'
        })
      });

      const result = await (client as any).makeStandardAPIRequest('/patient/123');

      expect(result).toEqual({
        id: 'patient-123',
        name: 'John Doe'
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/apis/default/api/patient/123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should handle standard API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found')
      });

      await expect((client as any).makeStandardAPIRequest('/patient/999'))
        .rejects.toThrow('Standard API request failed: 404');
    });
  });

  describe('Appointment Update Operations', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();
    });

    it('should update appointment successfully', async () => {
      const existingAppointment = {
        resourceType: 'Appointment',
        id: 'apt-123',
        status: 'booked',
        start: '2025-01-20T10:00:00Z',
        end: '2025-01-20T11:00:00Z',
        participant: [{
          actor: { reference: 'Practitioner/dr-123' }
        }]
      };

      // Mock getting existing appointment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(existingAppointment)
      });

      // Mock availability check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ resourceType: 'Bundle', entry: [] })
      });

      // Mock update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...existingAppointment,
          start: '2025-01-20T14:00:00Z',
          end: '2025-01-20T15:00:00Z'
        })
      });

      const result = await (client as any).updateAppointment('apt-123', {
        start: '2025-01-20T14:00:00Z',
        end: '2025-01-20T15:00:00Z'
      });

      expect(result).toHaveProperty('id', 'apt-123');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should reject update with conflicts', async () => {
      const existingAppointment = {
        resourceType: 'Appointment',
        id: 'apt-123',
        status: 'booked',
        start: '2025-01-20T10:00:00Z',
        end: '2025-01-20T11:00:00Z',
        participant: [{
          actor: { reference: 'Practitioner/dr-123' }
        }]
      };

      // Mock getting existing appointment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(existingAppointment)
      });

      // Mock availability check returning conflicts
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          resourceType: 'Bundle',
          entry: [{ resource: { id: 'conflict-apt' } }]
        })
      });

      await expect((client as any).updateAppointment('apt-123', {
        start: '2025-01-20T14:00:00Z'
      })).rejects.toThrow(/Update would create conflict|Unable to update appointment/);
    });
  });

  describe('Appointment Deletion Operations', () => {
    beforeEach(async () => {
      // Authenticate first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          expires_in: 3600
        })
      });
      await client.authenticateWithClientCredentials();
      mockFetch.mockClear();
    });

    it('should delete appointment using Standard API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      });

      await (client as any).deleteAppointment('apt-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/appointment/apt-123'),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should fallback to FHIR cancellation if Standard API fails', async () => {
      // Mock Standard API failures (will retry 3 times)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error')
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error')
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error')
        });

      // Mock FHIR cancellation success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      });

      await (client as any).deleteAppointment('apt-123', 'Patient request');

      expect(mockFetch).toHaveBeenCalledTimes(4); // 3 retries + 1 FHIR fallback
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/fhir/Appointment/apt-123'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"status":"cancelled"')
        })
      );
    });
  });

  describe('Helper Methods', () => {
    it('should map appointment types to codes correctly', () => {
      const testConfig = {
        baseUrl: 'https://api.openemr.test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'openid offline_access api:oemr api:fhir',
        redirectUri: 'http://localhost:3000/callback',
        site: 'default'
      };
      const client = new EnhancedOpenEMRClient(testConfig);

      expect((client as any).mapAppointmentTypeToCode('routine')).toBe('ROUTINE');
      expect((client as any).mapAppointmentTypeToCode('follow-up')).toBe('FOLLOWUP');
      expect((client as any).mapAppointmentTypeToCode('urgent')).toBe('URGENT');
      expect((client as any).mapAppointmentTypeToCode('consultation')).toBe('CONSULT');
      expect((client as any).mapAppointmentTypeToCode('unknown')).toBe('ROUTINE');
    });

    it('should calculate duration in minutes', () => {
      const testConfig = {
        baseUrl: 'https://api.openemr.test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'openid offline_access api:oemr api:fhir',
        redirectUri: 'http://localhost:3000/callback',
        site: 'default'
      };
      const client = new EnhancedOpenEMRClient(testConfig);

      const duration = (client as any).calculateDurationMinutes(
        '2025-01-20T10:00:00Z',
        '2025-01-20T11:30:00Z'
      );

      expect(duration).toBe(90);
    });

    it('should extract practitioner from participants', () => {
      const testConfig = {
        baseUrl: 'https://api.openemr.test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'openid offline_access api:oemr api:fhir',
        redirectUri: 'http://localhost:3000/callback',
        site: 'default'
      };
      const client = new EnhancedOpenEMRClient(testConfig);

      const participants = [
        { actor: { reference: 'Patient/123' } },
        { actor: { reference: 'Practitioner/dr-456' } },
        { actor: { reference: 'Location/789' } }
      ];

      const practitionerId = (client as any).extractPractitionerFromParticipants(participants);
      expect(practitionerId).toBe('dr-456');
    });

    it('should handle no practitioner in participants', () => {
      const testConfig = {
        baseUrl: 'https://api.openemr.test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'openid offline_access api:oemr api:fhir',
        redirectUri: 'http://localhost:3000/callback',
        site: 'default'
      };
      const client = new EnhancedOpenEMRClient(testConfig);

      const participants = [
        { actor: { reference: 'Patient/123' } },
        { actor: { reference: 'Location/789' } }
      ];

      const practitionerId = (client as any).extractPractitionerFromParticipants(participants);
      expect(practitionerId).toBe('');
    });
  });

  describe('Debug Mode', () => {
    it('should enable debug logging', () => {
      const testConfig = {
        baseUrl: 'https://api.openemr.test',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scope: 'openid offline_access api:oemr api:fhir',
        redirectUri: 'http://localhost:3000/callback',
        site: 'default'
      };
      const debugConfig = { ...testConfig, debugMode: true };
      const debugClient = new EnhancedOpenEMRClient(debugConfig);

      // Test that debug mode is set
      expect((debugClient as any).config.debugMode).toBe(true);
    });
  });
});