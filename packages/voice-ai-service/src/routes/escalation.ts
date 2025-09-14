import { Router, Request, Response } from 'express';
import { 
  EscalationTrigger, 
  EscalationPriority, 
  EscalationStatus,
  EscalationContext
} from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { EscalationManager } from '../services/escalation/escalationManager';
import { ConversationContextManager } from '../services/conversation/contextManager';

const logger = createLogger('escalation-routes');
const router = Router();

// Middleware to validate escalation manager
const requireEscalationManager = (req: Request, res: Response, next: any) => {
  if (!req.app.locals.escalationManager) {
    return res.status(500).json({
      error: 'Escalation service not available',
      message: 'Escalation manager not initialized'
    });
  }
  next();
};

/**
 * POST /escalation/trigger
 * Manually trigger an escalation
 */
router.post('/trigger', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { conversationId, trigger, priority, reason } = req.body;

    // Validate required fields
    if (!conversationId || !trigger || !priority) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'conversationId, trigger, and priority are required'
      });
    }

    // Validate enum values
    if (!Object.values(EscalationTrigger).includes(trigger)) {
      return res.status(400).json({
        error: 'Invalid trigger',
        message: `Trigger must be one of: ${Object.values(EscalationTrigger).join(', ')}`
      });
    }

    if (!Object.values(EscalationPriority).includes(priority)) {
      return res.status(400).json({
        error: 'Invalid priority',
        message: `Priority must be one of: ${Object.values(EscalationPriority).join(', ')}`
      });
    }

    const escalationManager: EscalationManager = req.app.locals.escalationManager;
    const contextManager: ConversationContextManager = req.app.locals.contextManager;

    // Get conversation context
    const context = contextManager.getEscalationContext(conversationId);
    if (!context) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: `No active conversation found with ID: ${conversationId}`
      });
    }

    // Trigger escalation
    const escalation = await escalationManager.triggerEscalation(
      context,
      trigger,
      priority,
      reason
    );

    res.status(201).json({
      success: true,
      escalation: {
        id: escalation.id,
        conversationId: escalation.conversationId,
        trigger: escalation.trigger,
        priority: escalation.priority,
        status: escalation.status,
        triggeredAt: escalation.triggeredAt
      }
    });

  } catch (error) {
    logger.error('Error triggering escalation', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to trigger escalation'
    });
  }
});

/**
 * POST /escalation/:escalationId/acknowledge
 * Acknowledge an escalation
 */
router.post('/:escalationId/acknowledge', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { escalationId } = req.params;
    const { staffId } = req.body;

    if (!staffId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'staffId is required'
      });
    }

    const escalationManager: EscalationManager = req.app.locals.escalationManager;

    await escalationManager.acknowledgeEscalation(escalationId, staffId);

    res.json({
      success: true,
      message: 'Escalation acknowledged successfully'
    });

  } catch (error) {
    logger.error('Error acknowledging escalation', { 
      escalationId: req.params.escalationId, 
      error 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Escalation not found',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to acknowledge escalation'
    });
  }
});

/**
 * POST /escalation/:escalationId/resolve
 * Resolve an escalation
 */
router.post('/:escalationId/resolve', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { escalationId } = req.params;
    const { staffId, resolution, followUpRequired = false } = req.body;

    if (!staffId || !resolution) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'staffId and resolution are required'
      });
    }

    const escalationManager: EscalationManager = req.app.locals.escalationManager;

    await escalationManager.resolveEscalation(
      escalationId, 
      staffId, 
      resolution, 
      followUpRequired
    );

    res.json({
      success: true,
      message: 'Escalation resolved successfully'
    });

  } catch (error) {
    logger.error('Error resolving escalation', { 
      escalationId: req.params.escalationId, 
      error 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Escalation not found',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to resolve escalation'
    });
  }
});

/**
 * GET /escalation/:escalationId
 * Get escalation details
 */
router.get('/:escalationId', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { escalationId } = req.params;
    const escalationManager: EscalationManager = req.app.locals.escalationManager;

    const context = await escalationManager.getHandoffContext(escalationId);
    
    res.json({
      success: true,
      context
    });

  } catch (error) {
    logger.error('Error getting escalation details', { 
      escalationId: req.params.escalationId, 
      error 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Escalation not found',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get escalation details'
    });
  }
});

/**
 * GET /escalation/active
 * Get all active escalations
 */
router.get('/active', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const escalationManager: EscalationManager = req.app.locals.escalationManager;
    const activeEscalations = escalationManager.getActiveEscalations();

    // Filter sensitive information
    const sanitizedEscalations = activeEscalations.map(escalation => ({
      id: escalation.id,
      conversationId: escalation.conversationId,
      trigger: escalation.trigger,
      priority: escalation.priority,
      status: escalation.status,
      triggeredAt: escalation.triggeredAt,
      notifiedAt: escalation.notifiedAt,
      acknowledgedAt: escalation.acknowledgedAt,
      acknowledgedBy: escalation.acknowledgedBy,
      patientName: escalation.context.patientName || 'Unknown',
      phoneNumber: escalation.context.phoneNumber ? 
        `***-***-${escalation.context.phoneNumber.slice(-4)}` : 'Unknown',
      currentIntent: escalation.context.currentIntent,
      emotionalState: escalation.context.emotionalState?.overall
    }));

    res.json({
      success: true,
      escalations: sanitizedEscalations,
      count: sanitizedEscalations.length
    });

  } catch (error) {
    logger.error('Error getting active escalations', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get active escalations'
    });
  }
});

/**
 * GET /escalation/metrics
 * Get escalation metrics
 */
router.get('/metrics', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 30 days if not provided
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Please provide valid ISO date strings'
      });
    }

    if (start >= end) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'Start date must be before end date'
      });
    }

    const escalationManager: EscalationManager = req.app.locals.escalationManager;
    const metrics = await escalationManager.getMetrics(start, end);

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    logger.error('Error getting escalation metrics', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get escalation metrics'
    });
  }
});

/**
 * GET /escalation/conversation/:conversationId/summary
 * Get conversation summary for handoff
 */
router.get('/conversation/:conversationId/summary', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const contextManager: ConversationContextManager = req.app.locals.contextManager;

    const summary = contextManager.generateConversationSummary(conversationId);

    if (!summary || summary === 'Conversation not found') {
      return res.status(404).json({
        error: 'Conversation not found',
        message: `No active conversation found with ID: ${conversationId}`
      });
    }

    res.json({
      success: true,
      summary
    });

  } catch (error) {
    logger.error('Error getting conversation summary', { 
      conversationId: req.params.conversationId, 
      error 
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get conversation summary'
    });
  }
});

/**
 * POST /escalation/conversation/:conversationId/handoff
 * Mark conversation as handed off to staff
 */
router.post('/conversation/:conversationId/handoff', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { staffId } = req.body;

    if (!staffId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'staffId is required'
      });
    }

    const contextManager: ConversationContextManager = req.app.locals.contextManager;
    contextManager.markAsHandedOff(conversationId, staffId);

    res.json({
      success: true,
      message: 'Conversation successfully handed off to staff'
    });

  } catch (error) {
    logger.error('Error marking handoff', { 
      conversationId: req.params.conversationId, 
      error 
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark conversation as handed off'
    });
  }
});

/**
 * GET /escalation/system/status
 * Get system status and statistics
 */
router.get('/system/status', requireEscalationManager, async (req: Request, res: Response) => {
  try {
    const escalationManager: EscalationManager = req.app.locals.escalationManager;
    const contextManager: ConversationContextManager = req.app.locals.contextManager;
    const notificationService = req.app.locals.notificationService;

    const activeEscalations = escalationManager.getActiveEscalations();
    const conversationStats = contextManager.getSessionStats();

    // Get department status if notification service available
    let departmentStatus = {};
    if (notificationService) {
      departmentStatus = {
        reception: notificationService.getDepartmentStatus('reception'),
        medical: notificationService.getDepartmentStatus('medical'),
        billing: notificationService.getDepartmentStatus('billing'),
        technical: notificationService.getDepartmentStatus('technical')
      };
    }

    res.json({
      success: true,
      status: {
        escalations: {
          active: activeEscalations.length,
          byCritical: activeEscalations.filter(e => e.priority === EscalationPriority.CRITICAL).length,
          byHigh: activeEscalations.filter(e => e.priority === EscalationPriority.HIGH).length,
          byNormal: activeEscalations.filter(e => e.priority === EscalationPriority.NORMAL).length,
          byLow: activeEscalations.filter(e => e.priority === EscalationPriority.LOW).length,
        },
        conversations: conversationStats,
        staff: departmentStatus,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting system status', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get system status'
    });
  }
});

export { router as escalationRouter };