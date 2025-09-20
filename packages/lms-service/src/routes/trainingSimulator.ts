import express from 'express';
import { z } from 'zod';
import TrainingSimulatorService from '../services/trainingSimulatorService';
import { logger, auditLog } from '../utils/logger';
import { ApiResponse } from '../types';

const router = express.Router();
const simulatorService = new TrainingSimulatorService();

// Validation schemas
const StartSimulationSchema = z.object({
  scenarioId: z.string(),
  userId: z.string()
});

const ProcessActionSchema = z.object({
  sessionId: z.string(),
  action: z.object({
    type: z.string(),
    target: z.string(),
    parameters: z.any().optional(),
    result: z.any().optional()
  })
});

const ScenarioFiltersSchema = z.object({
  type: z.enum(['call_handling', 'dashboard_usage', 'escalation', 'troubleshooting']).optional(),
  difficulty: z.number().min(1).max(5).optional()
});

/**
 * GET /scenarios
 * Get available training scenarios with optional filtering
 */
router.get('/scenarios', async (req, res) => {
  try {
    const filters = ScenarioFiltersSchema.parse(req.query);

    const scenarios = simulatorService.getScenarios(filters);

    // Remove internal implementation details from response
    const publicScenarios = scenarios.map(scenario => ({
      id: scenario.id,
      type: scenario.type,
      difficulty: scenario.difficulty,
      timeLimit: scenario.timeLimit,
      title: scenario.setup.context,
      description: scenario.setup.context,
      objectives: scenario.tasks.map(task => task.description),
      estimatedDuration: Math.ceil(scenario.timeLimit / 60) // convert to minutes
    }));

    logger.info('Training scenarios retrieved', {
      count: publicScenarios.length,
      filters,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: {
        scenarios: publicScenarios,
        total: publicScenarios.length
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving scenarios:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve training scenarios',
        code: 'SCENARIOS_RETRIEVAL_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /scenarios/:id
 * Get detailed information about a specific scenario
 */
router.get('/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const scenarios = simulatorService.getScenarios();
    const scenario = scenarios.find(s => s.id === id);

    if (!scenario) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Scenario not found',
          code: 'SCENARIO_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    // Provide detailed info without revealing answers
    const detailedScenario = {
      id: scenario.id,
      type: scenario.type,
      difficulty: scenario.difficulty,
      timeLimit: scenario.timeLimit,
      context: scenario.setup.context,
      systemState: scenario.setup.systemState,
      tasks: scenario.tasks.map(task => ({
        description: task.description,
        timeTarget: task.timeTarget,
        requiredActionCount: task.requiredActions.length,
        optionalActionCount: task.optionalActions?.length || 0,
        forbiddenActionCount: task.forbiddenActions?.length || 0
      })),
      evaluationCriteria: scenario.evaluation.map(criteria => ({
        criterion: criteria.criterion,
        weight: criteria.weight
      })),
      hintsAvailable: scenario.hints.length
    };

    logger.info('Scenario details retrieved', {
      scenarioId: id,
      userId: (req as any).user?.id
    });

    const response: ApiResponse = {
      success: true,
      data: detailedScenario
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving scenario details:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve scenario details',
        code: 'SCENARIO_DETAILS_ERROR',
        details: error
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /start
 * Start a new simulation session
 */
router.post('/start', async (req, res) => {
  try {
    const validatedData = StartSimulationSchema.parse(req.body);
    const { scenarioId, userId } = validatedData;

    // Verify user permissions (in real implementation, check against authenticated user)
    const requestingUser = (req as any).user;
    if (requestingUser && requestingUser.id !== userId && requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Unauthorized to start simulation for this user',
          code: 'UNAUTHORIZED'
        }
      };
      return res.status(403).json(response);
    }

    const session = await simulatorService.startSimulation(userId, scenarioId);

    // Return session info without internal details
    const sessionInfo = {
      sessionId: session.id,
      scenarioId: session.scenarioId,
      status: session.status,
      startTime: session.startTime,
      timeLimit: session.scenario.timeLimit,
      currentTask: session.scenario.tasks[0].description,
      taskCount: session.scenario.tasks.length
    };

    auditLog.userAccess(userId, 'SIMULATION_START', `/simulator/${scenarioId}`, true, {
      sessionId: session.id
    });

    logger.info('Simulation session started', {
      sessionId: session.id,
      scenarioId,
      userId
    });

    const response: ApiResponse = {
      success: true,
      data: sessionInfo
    };

    res.json(response);
  } catch (error) {
    logger.error('Error starting simulation:', error);

    auditLog.userAccess(req.body.userId, 'SIMULATION_START', '/simulator/start', false, {
      error: error.message
    });

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to start simulation',
        code: 'SIMULATION_START_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /action
 * Process a user action during simulation
 */
router.post('/action', async (req, res) => {
  try {
    const validatedData = ProcessActionSchema.parse(req.body);
    const { sessionId, action } = validatedData;

    const result = await simulatorService.processAction(sessionId, action);

    // Get updated session status
    const status = simulatorService.getSimulationStatus(sessionId);

    logger.info('Simulation action processed', {
      sessionId,
      actionType: action.type,
      actionTarget: action.target,
      success: result.success,
      score: result.score
    });

    const response: ApiResponse = {
      success: true,
      data: {
        actionResult: {
          success: result.success,
          message: result.message,
          score: result.score,
          violations: result.violations,
          hint: result.nextHint ? {
            message: result.nextHint.message,
            penalty: result.nextHint.penalty
          } : null
        },
        sessionStatus: status
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error processing simulation action:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to process simulation action',
        code: 'ACTION_PROCESSING_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /status/:sessionId
 * Get current simulation status
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const status = simulatorService.getSimulationStatus(sessionId);

    if (!status) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Simulation session not found',
          code: 'SESSION_NOT_FOUND'
        }
      };
      return res.status(404).json(response);
    }

    logger.info('Simulation status retrieved', {
      sessionId,
      status: status.status,
      progress: `${status.currentTaskIndex}/${status.totalTasks}`
    });

    const response: ApiResponse = {
      success: true,
      data: status
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving simulation status:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve simulation status',
        code: 'STATUS_RETRIEVAL_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * POST /complete/:sessionId
 * Manually complete a simulation (for testing or admin purposes)
 */
router.post('/complete/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const requestingUser = (req as any).user;

    // Only allow admins to manually complete simulations
    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required to manually complete simulations',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    const performance = await simulatorService.completeSimulation(sessionId);

    auditLog.userAccess(requestingUser.id, 'SIMULATION_MANUAL_COMPLETE', `/simulator/${sessionId}`, true, {
      sessionId,
      finalScore: performance.overallScore
    });

    logger.info('Simulation manually completed', {
      sessionId,
      adminId: requestingUser.id,
      finalScore: performance.overallScore
    });

    const response: ApiResponse = {
      success: true,
      data: {
        performance: {
          overallScore: performance.overallScore,
          completionTime: performance.completionTime,
          hintsUsed: performance.hintsUsed,
          slaCompliance: performance.slaCompliance,
          feedback: performance.feedback,
          timestamp: performance.timestamp
        }
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error manually completing simulation:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to complete simulation',
        code: 'MANUAL_COMPLETION_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

/**
 * GET /analytics/scenarios
 * Get analytics about scenario performance (admin only)
 */
router.get('/analytics/scenarios', async (req, res) => {
  try {
    const requestingUser = (req as any).user;

    if (!requestingUser || requestingUser.role !== 'admin') {
      const response: ApiResponse = {
        success: false,
        error: {
          message: 'Admin access required for scenario analytics',
          code: 'ADMIN_REQUIRED'
        }
      };
      return res.status(403).json(response);
    }

    // In a real implementation, this would query a database
    // For now, return mock analytics data
    const analytics = {
      totalSimulationsCompleted: 156,
      averageScore: 78.5,
      scenarioPerformance: [
        {
          scenarioId: 'handle_verification_failure',
          averageScore: 82.3,
          completionRate: 94.2,
          averageTime: 185,
          commonIssues: ['Late escalation acceptance', 'HIPAA compliance gaps']
        },
        {
          scenarioId: 'confused_elderly_patient',
          averageScore: 89.1,
          completionRate: 98.5,
          averageTime: 275,
          commonIssues: ['Insufficient accommodation notes']
        },
        {
          scenarioId: 'ai_not_understanding',
          averageScore: 71.7,
          completionRate: 87.3,
          averageTime: 165,
          commonIssues: ['Slow issue identification', 'Missing issue reports']
        }
      ],
      improvementAreas: [
        'Technical troubleshooting speed',
        'HIPAA compliance consistency',
        'Documentation completeness'
      ]
    };

    logger.info('Scenario analytics retrieved', {
      adminId: requestingUser.id
    });

    const response: ApiResponse = {
      success: true,
      data: analytics
    };

    res.json(response);
  } catch (error) {
    logger.error('Error retrieving scenario analytics:', error);

    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Failed to retrieve scenario analytics',
        code: 'ANALYTICS_ERROR',
        details: error.message
      }
    };

    res.status(500).json(response);
  }
});

export default router;