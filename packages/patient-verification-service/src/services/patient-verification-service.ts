/**
 * Patient Verification Service
 * 
 * Main service orchestrating patient identity verification with OpenEMR integration,
 * session management, and HIPAA-compliant audit logging
 */

import { OpenEMRClient, Patient } from './openemr-client';
import { VerificationSessionManager } from './verification-session-manager';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('patient-verification-service');

export interface VerificationConfig {
  openemr: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
  verification: {
    maxAttempts: number;
    sessionTimeoutMinutes: number;
    requirePhone: boolean;
  };
}

export interface VerificationRequest {
  sessionId?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD format
  phoneNumber?: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    conversationId?: string;
  };
}

export interface VerificationResult {
  success: boolean;
  sessionId: string;
  patientId?: string;
  attempts: number;
  maxAttempts: number;
  escalationRequired: boolean;
  verificationToken?: string;
  message: string;
  nextSteps?: string[];
}

export class PatientVerificationService {
  private openemrClient: OpenEMRClient;
  private sessionManager: VerificationSessionManager;
  private config: VerificationConfig;

  constructor(config: VerificationConfig) {
    this.config = config;
    this.openemrClient = new OpenEMRClient({
      baseUrl: config.openemr.baseUrl,
      clientId: config.openemr.clientId,
      clientSecret: config.openemr.clientSecret,
      scope: 'openid offline_access api:oemr user/patient.read'
    });
    this.sessionManager = new VerificationSessionManager();
  }

  async initialize(): Promise<void> {
    try {
      await this.sessionManager.connect();
      await this.openemrClient.authenticateWithPassword(
        this.config.openemr.username,
        this.config.openemr.password
      );
      logger.info('Patient verification service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize patient verification service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.sessionManager.disconnect();
    await this.openemrClient.logout();
    logger.info('Patient verification service shut down');
  }

  /**
   * Start a new verification session
   */
  async startVerification(sessionId?: string): Promise<{ sessionId: string; message: string }> {
    try {
      const session = await this.sessionManager.createSession(
        sessionId,
        this.config.verification.maxAttempts,
        this.config.verification.sessionTimeoutMinutes
      );

      return {
        sessionId: session.sessionId,
        message: 'Verification session started. Please provide your first name, last name, and date of birth.'
      };
    } catch (error) {
      logger.error('Error starting verification session', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Unable to start verification session');
    }
  }

  /**
   * Verify patient identity
   */
  async verifyPatient(request: VerificationRequest): Promise<VerificationResult> {
    try {
      // Get or create session
      let session = request.sessionId ? 
        await this.sessionManager.getSession(request.sessionId) : 
        null;

      if (!session) {
        session = await this.sessionManager.createSession(
          request.sessionId,
          this.config.verification.maxAttempts,
          this.config.verification.sessionTimeoutMinutes
        );
      }

      // Check if session is already escalated or expired
      if (session.escalationTriggered) {
        return {
          success: false,
          sessionId: session.sessionId,
          attempts: session.attempts,
          maxAttempts: session.maxAttempts,
          escalationRequired: true,
          message: 'Maximum verification attempts exceeded. Please speak with a staff member.',
          nextSteps: ['escalate_to_human', 'provide_alternative_verification']
        };
      }

      // Check if already verified
      if (session.verified && session.patientId) {
        const verificationToken = this.sessionManager.generateVerificationToken(session);
        return {
          success: true,
          sessionId: session.sessionId,
          patientId: session.patientId,
          attempts: session.attempts,
          maxAttempts: session.maxAttempts,
          escalationRequired: false,
          verificationToken,
          message: 'Patient identity already verified.',
          nextSteps: ['proceed_with_service', 'access_patient_information']
        };
      }

      // Attempt verification with OpenEMR
      let patient: Patient | null = null;
      let failureReason: string | undefined;

      try {
        patient = await this.openemrClient.verifyPatient(
          request.firstName,
          request.lastName,
          request.dateOfBirth,
          request.phoneNumber
        );

        if (!patient) {
          failureReason = 'No matching patient found with provided information';
        } else if (this.config.verification.requirePhone && request.phoneNumber && 
                   !this.matchesPhone(patient, request.phoneNumber)) {
          patient = null;
          failureReason = 'Phone number does not match records';
        }
      } catch (error) {
        failureReason = 'Unable to verify with patient records system';
        logger.error('OpenEMR verification failed', {
          sessionId: session.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Record the attempt
      const updatedSession = await this.sessionManager.recordAttempt(
        session.sessionId,
        patient !== null,
        {
          firstName: request.firstName,
          lastName: request.lastName,
          dob: request.dateOfBirth,
          ...(request.phoneNumber && { phone: request.phoneNumber })
        },
        failureReason,
        request.metadata
      );

      if (!updatedSession) {
        throw new Error('Failed to record verification attempt');
      }

      // Handle successful verification
      if (patient) {
        updatedSession.patientId = patient.pid;
        await this.sessionManager.saveSession(updatedSession);

        const verificationToken = this.sessionManager.generateVerificationToken(updatedSession);

        logger.info('Patient verification successful', {
          sessionId: updatedSession.sessionId,
          patientId: patient.pid,
          attempts: updatedSession.attempts
        });

        return {
          success: true,
          sessionId: updatedSession.sessionId,
          patientId: patient.pid,
          attempts: updatedSession.attempts,
          maxAttempts: updatedSession.maxAttempts,
          escalationRequired: false,
          verificationToken,
          message: 'Identity verified successfully.',
          nextSteps: ['proceed_with_service', 'access_patient_information']
        };
      }

      // Handle failed verification
      const attemptsRemaining = updatedSession.maxAttempts - updatedSession.attempts;
      
      if (updatedSession.escalationTriggered) {
        logger.warn('Patient verification escalation triggered', {
          sessionId: updatedSession.sessionId,
          attempts: updatedSession.attempts,
          maxAttempts: updatedSession.maxAttempts
        });

        return {
          success: false,
          sessionId: updatedSession.sessionId,
          attempts: updatedSession.attempts,
          maxAttempts: updatedSession.maxAttempts,
          escalationRequired: true,
          message: 'Unable to verify your identity. Please speak with a staff member for assistance.',
          nextSteps: ['escalate_to_human', 'provide_alternative_verification']
        };
      }

      return {
        success: false,
        sessionId: updatedSession.sessionId,
        attempts: updatedSession.attempts,
        maxAttempts: updatedSession.maxAttempts,
        escalationRequired: false,
        message: `Unable to verify your identity. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining. Please check your information and try again.`,
        nextSteps: attemptsRemaining > 0 ? 
          ['retry_verification', 'check_information'] : 
          ['escalate_to_human']
      };

    } catch (error) {
      logger.error('Patient verification error', {
        sessionId: request.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error('Verification service temporarily unavailable');
    }
  }

  /**
   * Check if provided phone number matches patient records
   */
  private matchesPhone(patient: Patient, phoneNumber: string): boolean {
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const normalizedInput = normalizePhone(phoneNumber);
    
    const homeMatch = patient.phone_home && normalizePhone(patient.phone_home) === normalizedInput;
    const cellMatch = patient.phone_cell && normalizePhone(patient.phone_cell) === normalizedInput;
    
    return Boolean(homeMatch || cellMatch);
  }

  /**
   * Get verification session status
   */
  async getVerificationStatus(sessionId: string): Promise<{
    found: boolean;
    verified: boolean;
    attempts: number;
    maxAttempts: number;
    escalationRequired: boolean;
    expiresAt?: Date;
  }> {
    const session = await this.sessionManager.getSession(sessionId);
    
    if (!session) {
      return {
        found: false,
        verified: false,
        attempts: 0,
        maxAttempts: 0,
        escalationRequired: false
      };
    }

    return {
      found: true,
      verified: session.verified,
      attempts: session.attempts,
      maxAttempts: session.maxAttempts,
      escalationRequired: session.escalationTriggered,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Validate verification token
   */
  validateVerificationToken(token: string): {
    valid: boolean;
    patientId?: string;
    sessionId?: string;
    error?: string;
  } {
    const result = this.sessionManager.verifyToken(token);
    
    if (result.valid && result.payload) {
      return {
        valid: true,
        patientId: result.payload.patientId,
        sessionId: result.payload.sessionId
      };
    }

    return {
      valid: false,
      ...(result.error && { error: result.error })
    };
  }

  /**
   * Generate conversation flow for collecting verification information
   */
  generateConversationFlow(currentStep: 'start' | 'first_name' | 'last_name' | 'dob' | 'phone' = 'start'): {
    prompt: string;
    expectedInfo: string;
    nextStep: string;
  } {
    const flows = {
      start: {
        prompt: "To help me assist you, I'll need to verify your identity first. May I have your first name?",
        expectedInfo: 'first_name',
        nextStep: 'first_name'
      },
      first_name: {
        prompt: "Thank you. Now, what is your last name?",
        expectedInfo: 'last_name',
        nextStep: 'last_name'
      },
      last_name: {
        prompt: "Perfect. For verification, I'll need your date of birth. Please provide it in the format month, day, year.",
        expectedInfo: 'date_of_birth',
        nextStep: 'dob'
      },
      dob: {
        prompt: "Lastly, to complete the verification, may I have the phone number we have on file for you?",
        expectedInfo: 'phone_number',
        nextStep: 'phone'
      },
      phone: {
        prompt: "Thank you. Let me verify this information with our patient records.",
        expectedInfo: 'verification_complete',
        nextStep: 'verify'
      }
    };

    return flows[currentStep] || flows.start;
  }

  /**
   * Get audit trail for compliance
   */
  async getAuditTrail(sessionId: string): Promise<any[]> {
    return await this.sessionManager.getAuditTrail(sessionId);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; checks: Record<string, boolean> }> {
    const checks = {
      redis: false,
      openemr: false
    };

    try {
      // Test Redis connection
      await this.sessionManager.getSession('health_check');
      checks.redis = true;
    } catch (error) {
      logger.error('Redis health check failed', { error });
    }

    try {
      // Test OpenEMR connection
      const result = await this.openemrClient.testConnection();
      checks.openemr = result.success;
    } catch (error) {
      logger.error('OpenEMR health check failed', { error });
    }

    const allHealthy = Object.values(checks).every(check => check);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks
    };
  }
}