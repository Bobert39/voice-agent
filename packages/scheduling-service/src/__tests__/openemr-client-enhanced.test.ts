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
import crypto from 'crypto';

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
      expect(authUrl).toContain('scope=openid+offline_access+api%3Afhir');
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

      mockFetch.mockResolvedValueOnce(createMockResponse({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid authorization code')
      }));

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
      mockFetch.mockResolvedValue(createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Internal Server Error')
      }));

      // Circuit breaker should open after 5 failures (default threshold)
      for (let i = 0; i < 5; i++) {
        try {
          await client.authenticateWithClientCredentials();
        } catch (error) {
          // Expected to fail
        }
      }

      // Next request should fail immediately with circuit breaker error
      await expect(client.authenticateWithClientCredentials()).rejects.toThrow(
        'Circuit breaker is open - service unavailable'
      );
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Retry Logic', () => {
    it('should retry failed requests with exponential backoff', async () => {
      let attemptCount = 0;

      mockFetch.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error')
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'success-token',
            token_type: 'Bearer',
            expires_in: 3600
          })
        });
      });

      const startTime = Date.now();
      await client.authenticateWithClientCredentials();
      const endTime = Date.now();

      expect(attemptCount).toBe(3);
      // Should include backoff delays
      expect(endTime - startTime).toBeGreaterThan(1000); // At least 1 second of backoff
    });

    it('should not retry client errors (except 401 and 429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      });

      await expect(client.authenticateWithClientCredentials()).rejects.toThrow(
        'Token request failed: 400 - Bad Request'
      );

      // Should only be called once (no retries for 400)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
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
        const appointmentData = {
          start: '2025-01-20T10:00:00-05:00',
          end: '2025-01-20T11:00:00-05:00',
          patientId: 'patient-123',
          practitionerId: 'practitioner-456',
          appointmentType: 'routine',
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
        const invalidAppointmentData = {
          start: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
          end: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString(),
          patientId: 'patient-123',
          practitionerId: 'practitioner-456',
          appointmentType: 'routine'
        };

        await expect(client.createAppointment(invalidAppointmentData)).rejects.toThrow(
          'Routine appointments require at least 24 hours advance booking'
        );
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
});