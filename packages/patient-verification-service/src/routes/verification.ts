/**
 * Patient Verification API Routes
 * 
 * Provides REST endpoints for patient identity verification
 * with HIPAA-compliant security and rate limiting
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, param, validationResult } from 'express-validator';
import { PatientVerificationService, VerificationRequest } from '../services/patient-verification-service';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('verification-routes');
const router = Router();

// Rate limiting for verification attempts
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 verification attempts per 15 minutes per IP
  message: {
    error: 'Too many verification attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded for verification', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      error: 'Too many verification attempts',
      message: 'Please try again later',
      retryAfter: '15 minutes'
    });
  }
});

// Stricter rate limiting for starting new sessions
const sessionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // max 3 new sessions per 5 minutes per IP
  message: {
    error: 'Too many session creation attempts. Please try again later.'
  }
});

let verificationService: PatientVerificationService;

export function initializeRoutes(service: PatientVerificationService): Router {
  verificationService = service;
  return router;
}

/**
 * POST /verification/start
 * Start a new verification session
 */
router.post('/start', 
  sessionLimiter,
  async (req: Request, res: Response) => {
    try {
      const sessionId = req.body.sessionId;
      const result = await verificationService.startVerification(sessionId);
      
      logger.info('Verification session started', {
        sessionId: result.sessionId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error starting verification session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Unable to start verification session',
        message: 'Please try again later'
      });
    }
  }
);

/**
 * POST /verification/verify
 * Verify patient identity
 */
router.post('/verify',
  verificationLimiter,
  [
    body('firstName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[A-Za-z\s\-'\.]+$/)
      .withMessage('First name must be 1-50 characters and contain only letters, spaces, hyphens, apostrophes, and periods'),
    
    body('lastName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[A-Za-z\s\-'\.]+$/)
      .withMessage('Last name must be 1-50 characters and contain only letters, spaces, hyphens, apostrophes, and periods'),
    
    body('dateOfBirth')
      .isISO8601({ strict: true })
      .withMessage('Date of birth must be in YYYY-MM-DD format')
      .custom((value) => {
        const date = new Date(value);
        const now = new Date();
        const age = now.getFullYear() - date.getFullYear();
        if (age < 0 || age > 150) {
          throw new Error('Date of birth must result in age between 0 and 150 years');
        }
        return true;
      }),
    
    body('phoneNumber')
      .optional()
      .matches(/^[\+]?[1-9][\d]{0,15}$/)
      .withMessage('Phone number must be a valid international format'),
    
    body('sessionId')
      .optional()
      .isLength({ min: 10, max: 100 })
      .isAlphanumeric()
      .withMessage('Session ID must be 10-100 alphanumeric characters')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Verification request validation failed', {
          errors: errors.array(),
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const request: VerificationRequest = {
        sessionId: req.body.sessionId,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        dateOfBirth: req.body.dateOfBirth,
        phoneNumber: req.body.phoneNumber,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          conversationId: req.body.conversationId
        }
      };

      const result = await verificationService.verifyPatient(request);

      // Log verification attempt (without PII)
      logger.info('Patient verification attempted', {
        sessionId: result.sessionId,
        success: result.success,
        attempts: result.attempts,
        escalationRequired: result.escalationRequired,
        ip: req.ip
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Patient verification error', {
        sessionId: req.body.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Verification service error',
        message: 'Unable to process verification request. Please try again later.'
      });
    }
  }
);

/**
 * GET /verification/status/:sessionId
 * Get verification session status
 */
router.get('/status/:sessionId',
  [
    param('sessionId')
      .isLength({ min: 10, max: 100 })
      .isAlphanumeric()
      .withMessage('Session ID must be 10-100 alphanumeric characters')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format'
        });
      }

      const status = await verificationService.getVerificationStatus(req.params.sessionId);

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Error getting verification status', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Unable to retrieve verification status'
      });
    }
  }
);

/**
 * POST /verification/validate-token
 * Validate verification token
 */
router.post('/validate-token',
  [
    body('token')
      .isLength({ min: 10 })
      .withMessage('Token is required')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Token is required'
        });
      }

      const result = verificationService.validateVerificationToken(req.body.token);

      if (!result.valid) {
        logger.warn('Invalid verification token provided', {
          ip: req.ip,
          error: result.error
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid verification token',
          message: result.error
        });
      }

      res.json({
        success: true,
        data: {
          valid: result.valid,
          patientId: result.patientId,
          sessionId: result.sessionId
        }
      });

    } catch (error) {
      logger.error('Token validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Token validation failed'
      });
    }
  }
);

/**
 * GET /verification/conversation-flow/:step
 * Get conversation flow prompts for collecting verification information
 */
router.get('/conversation-flow/:step',
  [
    param('step')
      .isIn(['start', 'first_name', 'last_name', 'dob', 'phone'])
      .withMessage('Invalid conversation step')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid conversation step'
        });
      }

      const step = req.params.step as 'start' | 'first_name' | 'last_name' | 'dob' | 'phone';
      const flow = verificationService.generateConversationFlow(step);

      res.json({
        success: true,
        data: flow
      });

    } catch (error) {
      logger.error('Error generating conversation flow', {
        step: req.params.step,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Unable to generate conversation flow'
      });
    }
  }
);

/**
 * GET /verification/audit/:sessionId
 * Get audit trail for compliance (restricted access)
 */
router.get('/audit/:sessionId',
  [
    param('sessionId')
      .isLength({ min: 10, max: 100 })
      .isAlphanumeric()
      .withMessage('Session ID must be 10-100 alphanumeric characters')
  ],
  async (req: Request, res: Response) => {
    try {
      // In production, this should have proper authentication/authorization
      const authHeader = req.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer audit_')) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized access to audit trail'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format'
        });
      }

      const auditTrail = await verificationService.getAuditTrail(req.params.sessionId);

      logger.info('Audit trail accessed', {
        sessionId: req.params.sessionId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        data: {
          sessionId: req.params.sessionId,
          auditTrail
        }
      });

    } catch (error) {
      logger.error('Error retrieving audit trail', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        error: 'Unable to retrieve audit trail'
      });
    }
  }
);

export { router as verificationRouter };