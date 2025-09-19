import { Router } from 'express';
import { TrainingScenarioService } from '../services/trainingScenarioService';
import { logger, auditLog, performanceLog } from '../utils/logger';

const router = Router();
const trainingScenarioService = new TrainingScenarioService();

// GET /api/training-scenarios - Get all training scenarios
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await trainingScenarioService.getAllScenarios();

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/training-scenarios', 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('Error in GET /api/training-scenarios:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/training-scenarios/:id - Get specific training scenario
router.get('/:id', async (req, res) => {
  const startTime = Date.now();
  const { id } = req.params;

  try {
    const result = await trainingScenarioService.getScenarioById(id);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/training-scenarios/${id}`, 'GET', duration, result.success ? 200 : 404);

    if (result.success) {
      auditLog.dataAccess(req.user?.id || 'anonymous', 'training_scenario', id, 'READ');
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/training-scenarios/${id}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/training-scenarios/type/:type - Get scenarios by type
router.get('/type/:type', async (req, res) => {
  const startTime = Date.now();
  const { type } = req.params;

  try {
    if (!['call_handling', 'dashboard_usage', 'escalation', 'troubleshooting'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid scenario type',
          code: 'INVALID_TYPE'
        }
      });
    }

    const result = await trainingScenarioService.getScenariosByType(type as any);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/training-scenarios/type/${type}`, 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/training-scenarios/type/${type}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// GET /api/training-scenarios/difficulty/:level - Get scenarios by difficulty
router.get('/difficulty/:level', async (req, res) => {
  const startTime = Date.now();
  const { level } = req.params;

  try {
    const difficulty = parseInt(level);
    if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid difficulty level. Must be between 1 and 5',
          code: 'INVALID_DIFFICULTY'
        }
      });
    }

    const result = await trainingScenarioService.getScenariosByDifficulty(difficulty);

    const duration = Date.now() - startTime;
    performanceLog.apiCall(`/api/training-scenarios/difficulty/${level}`, 'GET', duration, result.success ? 200 : 500);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error(`Error in GET /api/training-scenarios/difficulty/${level}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        details: error
      }
    });
  }
});

// POST /api/training-scenarios - Create new training scenario (admin only)
router.post('/', async (req, res) => {
  const startTime = Date.now();

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

    const result = await trainingScenarioService.createScenario(req.body);

    const duration = Date.now() - startTime;
    performanceLog.apiCall('/api/training-scenarios', 'POST', duration, result.success ? 201 : 400);

    if (result.success) {
      auditLog.dataAccess(req.user.id, 'training_scenario', result.data!.id, 'CREATE');
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Error in POST /api/training-scenarios:', error);
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