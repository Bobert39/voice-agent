/**
 * OpenEMR Connectivity Validation Test Suite
 * 
 * Tests OAuth 2.0 authentication, patient verification,
 * appointment operations, and conflict detection
 */

import { OpenEMRClient } from '../services/openemr-client';
import { config } from 'dotenv';

// Load environment variables
config();

interface TestResult {
  testName: string;
  success: boolean;
  message: string;
  details?: any;
}

class OpenEMRConnectivityTest {
  private client: OpenEMRClient;
  private testResults: TestResult[] = [];

  constructor() {
    this.client = new OpenEMRClient({
      baseUrl: process.env.OPENEMR_BASE_URL || 'https://demo.openemr.io/openemr',
      clientId: process.env.OPENEMR_CLIENT_ID || '',
      clientSecret: process.env.OPENEMR_CLIENT_SECRET || '',
      scope: 'openid offline_access api:oemr user/patient.read user/appointment.read user/appointment.write',
      site: process.env.OPENEMR_SITE || 'default'
    });
  }

  private addResult(testName: string, success: boolean, message: string, details?: any): void {
    this.testResults.push({ testName, success, message, details });
    console.log(`${success ? '✅' : '❌'} ${testName}: ${message}`);
    if (details) {
      console.log('   Details:', JSON.stringify(details, null, 2));
    }
  }

  /**
   * Test 1: Client Registration
   */
  async testClientRegistration(): Promise<void> {
    try {
      const registration = await this.client.registerClient();
      this.addResult(
        'Client Registration', 
        true, 
        'Successfully registered OAuth2 client',
        { client_id: registration.client_id }
      );
    } catch (error) {
      this.addResult(
        'Client Registration', 
        false, 
        `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 2: OAuth 2.0 Authorization URL Generation
   */
  async testAuthorizationUrl(): Promise<void> {
    try {
      const authUrl = this.client.getAuthorizationUrl('test-state-123');
      const isValidUrl = authUrl.includes('/oauth2/') && authUrl.includes('authorize');
      
      this.addResult(
        'Authorization URL Generation',
        isValidUrl,
        isValidUrl ? 'Valid authorization URL generated' : 'Invalid authorization URL',
        { url: authUrl }
      );
    } catch (error) {
      this.addResult(
        'Authorization URL Generation',
        false,
        `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 3: Password Grant Authentication (Development Only)
   */
  async testPasswordAuthentication(): Promise<void> {
    try {
      // Use demo credentials or environment variables
      const username = process.env.OPENEMR_USERNAME || 'admin';
      const password = process.env.OPENEMR_PASSWORD || 'pass';

      const tokens = await this.client.authenticateWithPassword(username, password);
      
      this.addResult(
        'Password Authentication',
        !!tokens.access_token,
        'Successfully authenticated with password grant',
        { 
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          has_refresh_token: !!tokens.refresh_token
        }
      );
    } catch (error) {
      this.addResult(
        'Password Authentication',
        false,
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 4: API Connection Test
   */
  async testApiConnection(): Promise<void> {
    try {
      const result = await this.client.testConnection();
      this.addResult(
        'API Connection Test',
        result.success,
        result.message
      );
    } catch (error) {
      this.addResult(
        'API Connection Test',
        false,
        `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 5: Patient Verification
   */
  async testPatientVerification(): Promise<void> {
    try {
      // Test with sample patient data
      const patient = await this.client.verifyPatient(
        'John',
        'Doe', 
        '1980-01-01',
        '555-1234'
      );

      this.addResult(
        'Patient Verification',
        patient !== null,
        patient ? 'Patient found and verified' : 'Patient not found (expected for test)',
        patient ? { pid: patient.pid, name: `${patient.fname} ${patient.lname}` } : undefined
      );
    } catch (error) {
      this.addResult(
        'Patient Verification',
        false,
        `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 6: Appointment Retrieval
   */
  async testAppointmentRetrieval(): Promise<void> {
    try {
      // Test retrieving appointments for patient ID 1 (common in demos)
      const appointments = await this.client.getPatientAppointments('1');
      
      this.addResult(
        'Appointment Retrieval',
        Array.isArray(appointments),
        `Retrieved ${appointments.length} appointments`,
        { count: appointments.length, sample: appointments[0] }
      );
    } catch (error) {
      this.addResult(
        'Appointment Retrieval',
        false,
        `Retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 7: Available Slots Calculation
   */
  async testAvailableSlots(): Promise<void> {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      
      const slots = await this.client.getAvailableSlots('1', dateStr, 30);
      
      this.addResult(
        'Available Slots Calculation',
        Array.isArray(slots),
        `Calculated ${slots.length} available slots for ${dateStr}`,
        { date: dateStr, slot_count: slots.length, sample_slots: slots.slice(0, 3) }
      );
    } catch (error) {
      this.addResult(
        'Available Slots Calculation',
        false,
        `Calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 8: Conflict Detection
   */
  async testConflictDetection(): Promise<void> {
    try {
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 1);
      testDate.setHours(10, 0, 0, 0);
      
      const conflict = await this.client.checkAppointmentConflict(
        '1', // provider ID
        testDate.toISOString(),
        30 // duration in minutes
      );

      this.addResult(
        'Conflict Detection',
        typeof conflict.hasConflict === 'boolean',
        `Conflict check completed. Has conflict: ${conflict.hasConflict}`,
        { 
          has_conflict: conflict.hasConflict,
          conflicting_count: conflict.conflictingAppointments?.length || 0,
          reason: conflict.reason
        }
      );
    } catch (error) {
      this.addResult(
        'Conflict Detection',
        false,
        `Conflict detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test 9: Token Refresh (if refresh token available)
   */
  async testTokenRefresh(): Promise<void> {
    try {
      const newTokens = await this.client.refreshAccessToken();
      
      this.addResult(
        'Token Refresh',
        !!newTokens.access_token,
        'Successfully refreshed access token',
        { 
          token_type: newTokens.token_type,
          expires_in: newTokens.expires_in
        }
      );
    } catch (error) {
      this.addResult(
        'Token Refresh',
        false,
        `Token refresh failed: ${error instanceof Error ? error.message : 'Expected if no refresh token'}`
      );
    }
  }

  /**
   * Run all connectivity tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting OpenEMR Connectivity Validation Tests\n');
    
    const tests = [
      () => this.testClientRegistration(),
      () => this.testAuthorizationUrl(),
      () => this.testPasswordAuthentication(),
      () => this.testApiConnection(),
      () => this.testPatientVerification(),
      () => this.testAppointmentRetrieval(),
      () => this.testAvailableSlots(),
      () => this.testConflictDetection(),
      () => this.testTokenRefresh()
    ];

    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        console.error('Test execution error:', error);
      }
      console.log(''); // Add spacing between tests
    }

    this.printSummary();
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    const passed = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log('📊 TEST SUMMARY');
    console.log('================');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%`);
    console.log('');

    if (passed < total) {
      console.log('❌ FAILED TESTS:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => console.log(`   - ${r.testName}: ${r.message}`));
    } else {
      console.log('🎉 ALL TESTS PASSED!');
    }

    console.log('\n💡 RECOMMENDATIONS:');
    this.generateRecommendations();
  }

  /**
   * Generate implementation recommendations
   */
  private generateRecommendations(): void {
    const authPassed = this.testResults.find(r => r.testName === 'Password Authentication')?.success;
    const apiPassed = this.testResults.find(r => r.testName === 'API Connection Test')?.success;
    const patientPassed = this.testResults.find(r => r.testName === 'Patient Verification')?.success;

    if (!authPassed) {
      console.log('   • Set up proper OpenEMR credentials in environment variables');
      console.log('   • Enable OAuth2 in OpenEMR: Administration->Config->Connectors');
    }

    if (!apiPassed) {
      console.log('   • Verify OpenEMR base URL is accessible');
      console.log('   • Check firewall and network connectivity');
      console.log('   • Ensure SSL/TLS is properly configured');
    }

    if (authPassed && apiPassed) {
      console.log('   • ✅ Ready for production OAuth2 Authorization Code flow');
      console.log('   • ✅ Can proceed with appointment scheduling implementation');
      console.log('   • Consider implementing mock API for development testing');
    }

    console.log('   • Review HIPAA compliance requirements for production deployment');
    console.log('   • Implement proper error handling and logging');
    console.log('   • Set up monitoring for API availability and performance');
  }

  /**
   * Export test results for documentation
   */
  exportResults(): any {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.testResults.length,
        passed: this.testResults.filter(r => r.success).length,
        failed: this.testResults.filter(r => !r.success).length
      },
      tests: this.testResults
    };
  }
}

// Execute tests if run directly
if (require.main === module) {
  const tester = new OpenEMRConnectivityTest();
  tester.runAllTests().catch(console.error);
}

export { OpenEMRConnectivityTest };