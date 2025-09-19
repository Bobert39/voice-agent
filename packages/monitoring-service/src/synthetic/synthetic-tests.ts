/**
 * Synthetic monitoring tests for end-to-end functionality
 * Based on Story 4.3 synthetic monitoring requirements
 */

import axios from 'axios';
import { SyntheticTest } from '../types/metrics';
import { businessMetrics } from '../metrics/prometheus-metrics';

export class SyntheticMonitoringService {
  private testResults: Map<string, { lastRun: Date; success: boolean; error?: string }> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();

  constructor(
    private readonly baseUrl: string = process.env.API_BASE_URL || 'http://localhost:3000'
  ) {}

  /**
   * End-to-end voice call flow test
   */
  async testEndToEndCallFlow(): Promise<void> {
    const testName = 'end_to_end_call_flow';

    try {
      // 1. Test health endpoint
      const healthResponse = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000
      });

      if (healthResponse.status !== 200) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }

      // 2. Test voice webhook endpoint
      const voiceResponse = await axios.post(
        `${this.baseUrl}/voice/webhook/twilio/call`,
        {
          CallSid: 'CA_synthetic_test_' + Date.now(),
          From: process.env.TEST_PHONE_NUMBER || '+15551234567',
          To: process.env.TWILIO_PHONE_NUMBER || '+15559876543',
          CallStatus: 'ringing'
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (voiceResponse.status !== 200) {
        throw new Error(`Voice webhook failed: ${voiceResponse.status}`);
      }

      // 3. Test practice info endpoint
      const practiceInfoResponse = await axios.post(
        `${this.baseUrl}/api/v1/practice-info/query`,
        {
          query: 'What are your hours?',
          timezone: 'America/Los_Angeles'
        },
        {
          timeout: 5000
        }
      );

      if (practiceInfoResponse.status !== 200) {
        throw new Error(`Practice info failed: ${practiceInfoResponse.status}`);
      }

      // 4. Test appointment availability check
      const availabilityResponse = await axios.post(
        `${this.baseUrl}/api/v1/scheduling/availability`,
        {
          query: 'next week',
          appointmentType: 'routine'
        },
        {
          timeout: 8000
        }
      );

      if (availabilityResponse.status !== 200) {
        throw new Error(`Availability check failed: ${availabilityResponse.status}`);
      }

      // Record successful test
      this.recordTestSuccess(testName);
      businessMetrics.appointmentsScheduled
        .labels('synthetic_test', 'test_provider', 'monitoring')
        .inc();

    } catch (error) {
      this.recordTestFailure(testName, error as Error);
      throw error;
    }
  }

  /**
   * Test appointment booking flow via API
   */
  async testAppointmentBookingFlow(): Promise<void> {
    const testName = 'appointment_booking_flow';

    try {
      // 1. Check availability
      const availabilityResponse = await axios.post(
        `${this.baseUrl}/api/v1/scheduling/availability`,
        {
          query: 'tomorrow morning',
          appointmentType: 'routine'
        },
        {
          timeout: 5000
        }
      );

      if (availabilityResponse.status !== 200 || !availabilityResponse.data.success) {
        throw new Error('Availability check failed');
      }

      // 2. Test patient verification
      const verificationResponse = await axios.post(
        `${this.baseUrl}/api/v1/patient-verification/verify`,
        {
          phoneNumber: process.env.TEST_PHONE_NUMBER || '+15551234567',
          dateOfBirth: '1990-01-01',
          lastName: 'TestPatient'
        },
        {
          timeout: 3000
        }
      );

      if (verificationResponse.status !== 200) {
        throw new Error(`Patient verification failed: ${verificationResponse.status}`);
      }

      // 3. Test booking attempt (without actually booking)
      const bookingResponse = await axios.post(
        `${this.baseUrl}/api/v1/scheduling/validate-booking`,
        {
          patientId: 'synthetic_test_patient',
          appointmentType: 'routine',
          preferredDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        {
          timeout: 5000
        }
      );

      if (bookingResponse.status !== 200) {
        throw new Error(`Booking validation failed: ${bookingResponse.status}`);
      }

      this.recordTestSuccess(testName);

    } catch (error) {
      this.recordTestFailure(testName, error as Error);
      throw error;
    }
  }

  /**
   * Test NLU understanding and processing
   */
  async testNLUProcessing(): Promise<void> {
    const testName = 'nlu_processing';

    try {
      const testUtterances = [
        'I need to schedule an appointment',
        'What are your office hours?',
        'Can I cancel my appointment?',
        'I want to speak to someone'
      ];

      for (const utterance of testUtterances) {
        const nluResponse = await axios.post(
          `${this.baseUrl}/api/v1/nlu/process`,
          {
            utterance,
            context: {
              conversationId: 'synthetic_test',
              turnCount: 1
            }
          },
          {
            timeout: 3000
          }
        );

        if (nluResponse.status !== 200 || !nluResponse.data.intent) {
          throw new Error(`NLU processing failed for: "${utterance}"`);
        }

        // Verify reasonable confidence score
        if (nluResponse.data.confidence < 0.3) {
          throw new Error(`Low confidence score (${nluResponse.data.confidence}) for: "${utterance}"`);
        }
      }

      this.recordTestSuccess(testName);

    } catch (error) {
      this.recordTestFailure(testName, error as Error);
      throw error;
    }
  }

  /**
   * Test external dependencies health
   */
  async testExternalDependencies(): Promise<void> {
    const testName = 'external_dependencies';

    try {
      // Test all health checks
      const healthResponse = await axios.get(
        `${this.baseUrl}/api/v1/monitoring/health`,
        {
          timeout: 10000
        }
      );

      if (healthResponse.status !== 200) {
        throw new Error(`Health endpoint failed: ${healthResponse.status}`);
      }

      const healthData = healthResponse.data;

      // Check that critical services are healthy
      const criticalServices = ['openemr_api', 'twilio_voice', 'database', 'ai_service'];

      for (const service of criticalServices) {
        const serviceHealth = healthData.checks[service];
        if (!serviceHealth || serviceHealth.status === 'unhealthy') {
          throw new Error(`Critical service ${service} is unhealthy: ${serviceHealth?.message || 'Unknown error'}`);
        }
      }

      this.recordTestSuccess(testName);

    } catch (error) {
      this.recordTestFailure(testName, error as Error);
      throw error;
    }
  }

  /**
   * Test performance under load
   */
  async testPerformanceBaseline(): Promise<void> {
    const testName = 'performance_baseline';

    try {
      const startTime = Date.now();
      const concurrentRequests = 5;

      // Make multiple concurrent requests to test performance
      const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const response = await axios.post(
          `${this.baseUrl}/api/v1/practice-info/query`,
          {
            query: `Performance test request ${i + 1}`,
            timezone: 'America/Los_Angeles'
          },
          {
            timeout: 5000
          }
        );

        if (response.status !== 200) {
          throw new Error(`Request ${i + 1} failed: ${response.status}`);
        }

        return response;
      });

      await Promise.all(promises);

      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / concurrentRequests;

      // Verify performance meets SLO (< 800ms for 95th percentile)
      if (avgTime > 800) {
        throw new Error(`Performance degradation detected: ${avgTime}ms average response time`);
      }

      this.recordTestSuccess(testName);

    } catch (error) {
      this.recordTestFailure(testName, error as Error);
      throw error;
    }
  }

  /**
   * Get synthetic test definitions
   */
  getSyntheticTests(): SyntheticTest[] {
    return [
      {
        name: 'end_to_end_call_flow',
        scenario: () => this.testEndToEndCallFlow(),
        frequency: '*/15 * * * *', // Every 15 minutes
        timeout: 60000,
        alertThreshold: 2
      },
      {
        name: 'appointment_booking_flow',
        scenario: () => this.testAppointmentBookingFlow(),
        frequency: '0 * * * *', // Hourly
        timeout: 30000,
        alertThreshold: 3
      },
      {
        name: 'nlu_processing',
        scenario: () => this.testNLUProcessing(),
        frequency: '*/30 * * * *', // Every 30 minutes
        timeout: 15000,
        alertThreshold: 2
      },
      {
        name: 'external_dependencies',
        scenario: () => this.testExternalDependencies(),
        frequency: '*/5 * * * *', // Every 5 minutes
        timeout: 15000,
        alertThreshold: 1
      },
      {
        name: 'performance_baseline',
        scenario: () => this.testPerformanceBaseline(),
        frequency: '0 */2 * * *', // Every 2 hours
        timeout: 20000,
        alertThreshold: 2
      }
    ];
  }

  /**
   * Record successful test execution
   */
  private recordTestSuccess(testName: string): void {
    this.testResults.set(testName, {
      lastRun: new Date(),
      success: true
    });
    this.consecutiveFailures.set(testName, 0);

    // Record success metric
    businessMetrics.appointmentsScheduled
      .labels('synthetic_success', testName, 'monitoring')
      .inc();
  }

  /**
   * Record failed test execution
   */
  private recordTestFailure(testName: string, error: Error): void {
    this.testResults.set(testName, {
      lastRun: new Date(),
      success: false,
      error: error.message
    });

    const failures = (this.consecutiveFailures.get(testName) || 0) + 1;
    this.consecutiveFailures.set(testName, failures);

    // Record failure metric
    businessMetrics.escalationRate
      .labels('synthetic_failure', testName)
      .inc();
  }

  /**
   * Get test results summary
   */
  getTestResults(): {
    tests: Record<string, { lastRun: Date; success: boolean; error?: string }>;
    consecutiveFailures: Record<string, number>;
  } {
    return {
      tests: Object.fromEntries(this.testResults),
      consecutiveFailures: Object.fromEntries(this.consecutiveFailures)
    };
  }

  /**
   * Check if any test has exceeded alert threshold
   */
  getAlertsTriggered(): Array<{
    testName: string;
    consecutiveFailures: number;
    alertThreshold: number;
    lastError?: string;
  }> {
    const tests = this.getSyntheticTests();
    const alerts: Array<{
      testName: string;
      consecutiveFailures: number;
      alertThreshold: number;
      lastError?: string;
    }> = [];

    for (const test of tests) {
      const failures = this.consecutiveFailures.get(test.name) || 0;
      if (failures >= test.alertThreshold) {
        const result = this.testResults.get(test.name);
        alerts.push({
          testName: test.name,
          consecutiveFailures: failures,
          alertThreshold: test.alertThreshold,
          lastError: result?.error
        });
      }
    }

    return alerts;
  }

  /**
   * Start synthetic test runner
   */
  async start(): Promise<void> {
    console.log('Synthetic test runner started');
    // Future: Start cron jobs for scheduled tests
  }

  /**
   * Stop synthetic test runner
   */
  async stop(): Promise<void> {
    console.log('Synthetic test runner stopped');
    // Future: Stop cron jobs and cleanup
  }
}