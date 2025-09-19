import { Router } from 'express';
import { LearningModuleService } from '../services/learningModuleService';
import { logger, auditLog, performanceLog } from '../utils/logger';

const router = Router();
const learningModuleService = new LearningModuleService();

// GET /api/learning-modules - Get all learning modules
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await learningModuleService.getAllModules();

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/learning-modules', 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/learning-modules:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/learning-modules/:id - Get specific learning module
router.get('/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    const result = await learningModuleService.getModuleById(id);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/learning-modules/${id}`, 'GET', duration, result.success ? 200 : 404);

    if (result.success) {
      auditLog.dataAccess(req.user?.id || 'anonymous', 'learning_module', id, 'READ');
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/learning-modules/${id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/learning-modules/difficulty/:level - Get modules by difficulty
router.get('/difficulty/:level', async (req, res) => {
  const startTime = Date.now();
  const { level } = req.params;

  try {
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid difficulty level',
          code: 'INVALID_DIFFICULTY'
        }
      });
    }

    const result = await learningModuleService.getModulesByDifficulty(level as 'beginner' | 'intermediate' | 'advanced');

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/learning-modules/difficulty/${level}`, 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/learning-modules/difficulty/${level}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// POST /api/learning-modules - Create new learning module (admin only)
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Check admin permissions (simplified for now)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await learningModuleService.createModule(req.body);

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/learning-modules', 'POST', duration, result.success ? 201 : 400);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'learning_module', result.data!.id, 'CREATE');
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/learning-modules:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// PUT /api/learning-modules/:id - Update learning module (admin only)
router.put('/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    // Check admin permissions
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await learningModuleService.updateModule(id, req.body);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/learning-modules/${id}`, 'PUT', duration, result.success ? 200 : 400);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'learning_module', id, 'UPDATE');
      res.json(result);
    } else {
      res.status(result.error?.code === 'MODULE_NOT_FOUND' ? 404 : 400).json(result);
    }
  } catch (error) {
    logger.error(`Error in PUT /api/learning-modules/${id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// DELETE /api/learning-modules/:id - Delete learning module (admin only)
router.delete('/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    // Check admin permissions
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    const result = await learningModuleService.deleteModule(id);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/learning-modules/${id}`, 'DELETE', duration, result.success ? 200 : 404);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'learning_module', id, 'DELETE');
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error(`Error in DELETE /api/learning-modules/${id}:`, error);
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