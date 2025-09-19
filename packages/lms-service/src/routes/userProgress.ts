import { Router } from 'express';
import { UserProgressService } from '../services/userProgressService';
import { logger, auditLog, performanceLog } from '../utils/logger';

const router = Router();
const userProgressService = new UserProgressService();

// GET /api/user-progress/:userId - Get all progress for a user
router.get('/:userId', async (req, res) => {
  const startTime = Date.now();
  const { userId } = req.params;

  try {
    // Check permission - users can only view their own progress unless admin
    if (!req.user || (req.user.id !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.getUserProgress(userId);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/user-progress/${userId}`, 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/user-progress/${userId}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/user-progress/:userId/module/:moduleId - Get specific module progress
router.get('/:userId/module/:moduleId', async (req, res) => {
  const startTime = Date.now();
  const { userId, moduleId } = req.params;

  try {
    // Check permission
    if (!req.user || (req.user.id !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.getModuleProgress(userId, moduleId);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/user-progress/${userId}/module/${moduleId}`, 'GET', duration, result.success ? 200 : 404);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/user-progress/${userId}/module/${moduleId}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// PUT /api/user-progress/:userId/module/:moduleId - Update module progress
router.put('/:userId/module/:moduleId', async (req, res) => {
  const startTime = Date.now();
  const { userId, moduleId } = req.params;

  try {
    // Check permission - users can update their own progress
    if (!req.user || (req.user.id !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.updateProgress(userId, moduleId, req.body);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/user-progress/${userId}/module/${moduleId}`, 'PUT', duration, result.success ? 200 : 400);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'user_progress', `${userId}/${moduleId}`, 'UPDATE');
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error in PUT /api/user-progress/${userId}/module/${moduleId}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// POST /api/user-progress/:userId/module/:moduleId/complete - Complete a module
router.post('/:userId/module/:moduleId/complete', async (req, res) => {
  const startTime = Date.now();
  const { userId, moduleId } = req.params;
  const { finalScore } = req.body;

  try {
    // Check permission
    if (!req.user || (req.user.id !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    if (typeof finalScore !== 'number' || finalScore < 0 || finalScore > 100) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid final score. Must be a number between 0 and 100',
          code: 'INVALID_SCORE'
        }
      });
    }

    const result = await userProgressService.completeModule(userId, moduleId, finalScore);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/user-progress/${userId}/module/${moduleId}/complete`, 'POST', duration, result.success ? 200 : 400);

    if (result.success) {
      auditLog.systemEvent('MODULE_COMPLETION', {
        userId,
        moduleId,
        finalScore
      }, 'medium');
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error in POST /api/user-progress/${userId}/module/${moduleId}/complete:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// POST /api/user-progress/:userId/module/:moduleId/attempt - Increment attempt counter
router.post('/:userId/module/:moduleId/attempt', async (req, res) => {
  const startTime = Date.now();
  const { userId, moduleId } = req.params;

  try {
    // Check permission
    if (!req.user || (req.user.id !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.incrementAttempt(userId, moduleId);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/user-progress/${userId}/module/${moduleId}/attempt`, 'POST', duration, result.success ? 200 : 400);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error(`Error in POST /api/user-progress/${userId}/module/${moduleId}/attempt:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/analytics/completion-rate - Get completion rate analytics
router.get('/analytics/completion-rate', async (req, res) => {
  const startTime = Date.now();
  const { moduleId } = req.query;

  try {
    // Check admin permission for analytics
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.getCompletionRate(moduleId as string);

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/analytics/completion-rate', 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/analytics/completion-rate:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/analytics/training - Get comprehensive training analytics
router.get('/analytics/training', async (req, res) => {
  const startTime = Date.now();

  try {
    // Check admin permission for analytics
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await userProgressService.getTrainingAnalytics();

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/analytics/training', 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'training_analytics', 'comprehensive', 'READ');
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/analytics/training:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/users/status/:status - Get users by completion status
router.get('/users/status/:status', async (req, res) => {
  const startTime = Date.now();
  const { status } = req.params;

  try {
    // Check admin permission
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    if (!['not_started', 'in_progress', 'completed', 'certified'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid status',
          code: 'INVALID_STATUS'
        }
      });
    }

    const result = await userProgressService.getUsersByCompletionStatus(status as any);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/users/status/${status}`, 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/users/status/${status}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

export default router;