import { Router, Request, Response } from 'express';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { practiceInfoService } from '../services/practice-info-service';
import { dynamicResponseService } from '../services/dynamic-response-service';
import { ResponseGenerationContext, PatientResponseConfig } from '../types';

const router = Router();
const logger = createLogger('practice-info-routes');

// Default patient-friendly configuration
const defaultPatientConfig: PatientResponseConfig = {
  speechSpeedWpm: 160,
  pauseDurationMs: 750,
  confirmationPrompts: true,
  repetitionAvailable: true,
  maxInformationChunks: 3,
  useStructuredLanguage: true,
};

/**
 * Create response generation context from request
 */
function createContext(req: Request): ResponseGenerationContext {
  return {
    currentTime: new Date(),
    userTimezone: (req.query.timezone as string) || (req.body.timezone as string),
    previousQuestions: req.body.previousQuestions || [],
    conversationContext: req.body.conversationContext,
    config: defaultPatientConfig,
  };
}

/**
 * POST /api/v1/practice-info/query
 * Process natural language practice information query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string',
      });
    }

    const context = createContext(req);
    
    logger.info('Processing practice info query', {
      query,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    const response = await practiceInfoService.processNaturalLanguageQuery(query, context);
    
    return res.json({
      success: true,
      data: {
        response,
        timestamp: context.currentTime.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to process practice info query', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: 'Failed to process practice information query',
    });
  }
});

/**
 * GET /api/v1/practice-info/status
 * Get current practice status (open/closed)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const locationId = req.query.locationId as string;
    const timezone = req.query.timezone as string;
    
    const status = await dynamicResponseService.getCurrentStatus(locationId, timezone);
    
    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get current status', { error, query: req.query });
    return res.status(500).json({
      success: false,
      error: 'Failed to get current practice status',
    });
  }
});

/**
 * GET /api/v1/practice-info/hours
 * Get business hours information
 */
router.get('/hours', async (req: Request, res: Response) => {
  try {
    const locationId = req.query.locationId as string;
    const currentStatus = await dynamicResponseService.getCurrentStatus(locationId);
    const weeklyHours = await dynamicResponseService.getWeeklyHours(locationId);

    const context = createContext(req);
    const response = await dynamicResponseService.generateBusinessHoursResponse(currentStatus, weeklyHours, context);
    
    return res.json({
      success: true,
      data: {
        currentStatus,
        weeklyHours,
        response: response,
      },
    });
  } catch (error) {
    logger.error('Failed to get business hours', { error, query: req.query });
    return res.status(500).json({
      success: false,
      error: 'Failed to get business hours',
    });
  }
});

/**
 * GET /api/v1/practice-info/location
 * Get location information
 */
router.get('/location', async (req: Request, res: Response) => {
  try {
    const context = createContext(req);

    const response = await dynamicResponseService.generateLocationResponse(context);
    
    // Get location data for structured response
    const practiceInfo = await practiceInfoService.getComprehensivePracticeInfo();
    
    return res.json({
      success: true,
      data: {
        location: practiceInfo.practiceInfo.primaryLocation,
        response: response,
      },
    });
  } catch (error) {
    logger.error('Failed to get location information', { error, query: req.query });
    return res.status(500).json({
      success: false,
      error: 'Failed to get location information',
    });
  }
});

/**
 * POST /api/v1/practice-info/insurance
 * Check insurance coverage
 */
router.post('/insurance', async (req: Request, res: Response) => {
  try {
    const { insuranceCompany, planName } = req.body;
    
    const context = createContext(req);
    
    let insuranceQuery: string | undefined;
    if (insuranceCompany) {
      insuranceQuery = planName ? `${insuranceCompany} ${planName}` : insuranceCompany;
    }
    
    const response = await dynamicResponseService.generateInsuranceResponse(insuranceQuery, context);
    
    return res.json({
      success: true,
      data: {
        response,
      },
    });
  } catch (error) {
    logger.error('Failed to check insurance coverage', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: 'Failed to check insurance coverage',
    });
  }
});

/**
 * POST /api/v1/practice-info/preparation
 * Get appointment preparation instructions
 */
router.post('/preparation', async (req: Request, res: Response) => {
  try {
    const { appointmentType } = req.body;
    
    if (!appointmentType || typeof appointmentType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Appointment type is required and must be a string',
      });
    }

    const context = createContext(req);
    
    const response = await dynamicResponseService.generatePreparationResponse(appointmentType, context);
    
    return res.json({
      success: true,
      data: {
        response,
        appointmentType,
              },
    });
  } catch (error) {
    logger.error('Failed to get preparation instructions', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: 'Failed to get preparation instructions',
    });
  }
});

/**
 * GET /api/v1/practice-info/comprehensive
 * Get comprehensive practice information (for admin/integration use)
 */
router.get('/comprehensive', async (_req: Request, res: Response) => {
  try {
    const practiceInfo = await practiceInfoService.getComprehensivePracticeInfo();
    
    return res.json({
      success: true,
      data: practiceInfo,
    });
  } catch (error) {
    logger.error('Failed to get comprehensive practice info', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to get comprehensive practice information',
    });
  }
});

/**
 * POST /api/v1/practice-info/cache/clear
 * Clear all caches (admin endpoint)
 */
router.post('/cache/clear', async (_req: Request, res: Response) => {
  try {
    // In a real implementation, this would require admin authentication
    await practiceInfoService.clearCaches();
    
    return res.json({
      success: true,
      message: 'All practice information caches cleared',
    });
  } catch (error) {
    logger.error('Failed to clear caches', { error });
    return res.status(500).json({
      success: false,
      error: 'Failed to clear caches',
    });
  }
});

/**
 * GET /api/v1/practice-info/health
 * Health check endpoint for practice info service
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const cacheService = require('../services/cache').cacheService;
    const cacheHealth = await cacheService.getHealthStatus();
    
    return res.json({
      success: true,
      data: {
        service: 'practice-info-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cache: cacheHealth,
      },
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    return res.status(500).json({
      success: false,
      error: 'Service health check failed',
    });
  }
});

/**
 * Error handling middleware for practice info routes
 */
router.use((error: any, req: Request, res: Response, _next: any) => {
  logger.error('Practice info route error', { 
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
  });

  return res.status(500).json({
    success: false,
    error: 'Internal server error in practice information service',
  });
});

export default router;