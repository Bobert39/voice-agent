import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import {
  CreateConfigurationRequestSchema,
  UpdateConfigurationRequestSchema,
} from '../models/configuration.models';
import winston from 'winston';

const router = express.Router();
const configService = new ConfigurationService();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Middleware to extract user info (replace with your auth middleware)
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    practiceId: string;
    role: string;
  };
}

/**
 * @route POST /api/config
 * @desc Create new configuration
 * @access Private
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validation = CreateConfigurationRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid request data',
      });
    }

    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const result = await configService.createConfiguration(
      validation.data,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    // Log the request
    logger.info('Configuration creation request:', {
      userId: user.id,
      practiceId: user.practiceId,
      configType: validation.data.type,
      success: result.success,
      approvalRequired: result.approval_required,
    });
  } catch (error) {
    logger.error('Error in configuration creation:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create configuration',
    });
  }
});

/**
 * @route GET /api/config/:type
 * @desc Get configurations by type
 * @access Private
 */
router.get('/:type', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { type } = req.params;
    const includeInactive = req.query.include_inactive === 'true';

    const result = await configService.getConfigurations(
      type,
      user.practiceId,
      includeInactive
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Configuration retrieval request:', {
      userId: user.id,
      practiceId: user.practiceId,
      configType: type,
      includeInactive,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error in configuration retrieval:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve configurations',
    });
  }
});

/**
 * @route PUT /api/config/:type/:id
 * @desc Update existing configuration
 * @access Private
 */
router.put('/:type/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Validate request body
    const validation = UpdateConfigurationRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid request data',
      });
    }

    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { type, id } = req.params;
    const configId = parseInt(id, 10);

    if (isNaN(configId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid configuration ID'],
        message: 'Configuration ID must be a number',
      });
    }

    const result = await configService.updateConfiguration(
      type,
      configId,
      validation.data,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 200) : 400;
    res.status(statusCode).json(result);

    logger.info('Configuration update request:', {
      userId: user.id,
      practiceId: user.practiceId,
      configType: type,
      configId,
      success: result.success,
      approvalRequired: result.approval_required,
    });
  } catch (error) {
    logger.error('Error in configuration update:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to update configuration',
    });
  }
});

/**
 * @route DELETE /api/config/:type/:id
 * @desc Delete configuration
 * @access Private
 */
router.delete('/:type/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { type, id } = req.params;
    const configId = parseInt(id, 10);

    if (isNaN(configId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid configuration ID'],
        message: 'Configuration ID must be a number',
      });
    }

    const reason = req.body.reason || 'Configuration deleted';

    const result = await configService.deleteConfiguration(
      type,
      configId,
      user.id,
      user.practiceId,
      reason,
      req.ip,
      req.get('User-Agent')
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Configuration deletion request:', {
      userId: user.id,
      practiceId: user.practiceId,
      configType: type,
      configId,
      reason,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error in configuration deletion:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to delete configuration',
    });
  }
});

/**
 * @route GET /api/config/audit/:practice_id
 * @desc Get audit trail for configuration changes
 * @access Private
 */
router.get('/audit/:practice_id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { practice_id } = req.params;

    // Ensure user can only access their practice's audit trail
    if (practice_id !== user.practiceId && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        errors: ['Access denied'],
        message: 'Cannot access audit trail for other practices',
      });
    }

    const tableName = req.query.table_name as string;
    const recordId = req.query.record_id ? parseInt(req.query.record_id as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const result = await configService.getConfigurationAudit(
      practice_id,
      tableName,
      recordId,
      Math.min(limit, 1000) // Cap at 1000 records
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Configuration audit request:', {
      userId: user.id,
      practiceId: practice_id,
      tableName,
      recordId,
      limit,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error in configuration audit retrieval:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve audit trail',
    });
  }
});

/**
 * @route POST /api/config/approval/:id/approve
 * @desc Approve configuration change
 * @access Private (Admin/Manager only)
 */
router.post('/approval/:id/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Check if user has approval permissions
    if (user.role !== 'admin' && user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        errors: ['Insufficient permissions'],
        message: 'Only administrators and managers can approve configuration changes',
      });
    }

    const { id } = req.params;
    const approvalId = parseInt(id, 10);

    if (isNaN(approvalId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid approval ID'],
        message: 'Approval ID must be a number',
      });
    }

    const { comments } = req.body;

    const result = await configService.approveConfigurationChange(
      approvalId,
      user.id,
      comments
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Configuration approval request:', {
      userId: user.id,
      approvalId,
      comments,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error in configuration approval:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to approve configuration change',
    });
  }
});

/**
 * @route POST /api/config/approval/:id/reject
 * @desc Reject configuration change
 * @access Private (Admin/Manager only)
 */
router.post('/approval/:id/reject', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Check if user has approval permissions
    if (user.role !== 'admin' && user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        errors: ['Insufficient permissions'],
        message: 'Only administrators and managers can reject configuration changes',
      });
    }

    const { id } = req.params;
    const approvalId = parseInt(id, 10);

    if (isNaN(approvalId)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid approval ID'],
        message: 'Approval ID must be a number',
      });
    }

    const { comments } = req.body;

    if (!comments || comments.trim().length === 0) {
      return res.status(400).json({
        success: false,
        errors: ['Comments required'],
        message: 'Rejection reason must be provided',
      });
    }

    const result = await configService.rejectConfigurationChange(
      approvalId,
      user.id,
      comments
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Configuration rejection request:', {
      userId: user.id,
      approvalId,
      comments,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error in configuration rejection:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to reject configuration change',
    });
  }
});

/**
 * @route GET /api/config/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Basic health check - you can expand this to check database connectivity
    res.status(200).json({
      success: true,
      message: 'Configuration service is healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Configuration service is unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;