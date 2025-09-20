import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import { UpdatePolicySchema } from '../models/configuration.models';
import UpdatePipelineService from '../services/updatePipelineService';
import winston from 'winston';

const router = express.Router();
const configService = new ConfigurationService();
const pipelineService = new UpdatePipelineService();

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

// Middleware to extract user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    practiceId: string;
    role: string;
  };
}

// Update Management Service
class UpdateManager {
  /**
   * Simulate deployment process
   */
  public static async simulateDeployment(
    updatePolicy: any,
    updateType: 'patch' | 'minor' | 'major'
  ): Promise<{
    success: boolean;
    deployment_id: string;
    strategy: string;
    duration_seconds: number;
    rollback_required: boolean;
    metrics: any;
  }> {
    const deploymentId = `deploy_${Date.now()}_${updateType}`;
    const startTime = Date.now();

    logger.info('Starting deployment simulation:', {
      deploymentId,
      updateType,
      strategy: updatePolicy.deployment_strategy,
    });

    try {
      // Simulate deployment based on strategy
      const metrics = await this.executeDeploymentStrategy(
        updatePolicy.deployment_strategy,
        updateType
      );

      // Check rollback conditions
      const rollbackRequired = this.shouldRollback(metrics, updatePolicy.rollback_conditions);

      const duration = (Date.now() - startTime) / 1000;

      if (rollbackRequired) {
        logger.warn('Rollback required due to metrics:', { deploymentId, metrics });
        await this.performRollback(deploymentId, updatePolicy);
      }

      return {
        success: !rollbackRequired,
        deployment_id: deploymentId,
        strategy: updatePolicy.deployment_strategy,
        duration_seconds: duration,
        rollback_required: rollbackRequired,
        metrics,
      };
    } catch (error) {
      logger.error('Deployment simulation failed:', { deploymentId, error });
      throw error;
    }
  }

  /**
   * Execute deployment strategy
   */
  private static async executeDeploymentStrategy(
    strategy: string,
    updateType: string
  ): Promise<any> {
    let metrics;

    switch (strategy) {
      case 'rolling':
        metrics = await this.rollingDeployment(updateType);
        break;
      case 'blue-green':
        metrics = await this.blueGreenDeployment(updateType);
        break;
      case 'canary':
        metrics = await this.canaryDeployment(updateType);
        break;
      default:
        throw new Error(`Unsupported deployment strategy: ${strategy}`);
    }

    return metrics;
  }

  /**
   * Rolling deployment simulation
   */
  private static async rollingDeployment(updateType: string): Promise<any> {
    logger.info('Executing rolling deployment...');

    // Simulate gradual rollout
    const phases = ['25%', '50%', '75%', '100%'];
    const metrics = {
      error_rate: 0,
      response_time: 0,
      success_rate: 100,
      phases_completed: [],
    };

    for (const phase of phases) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate deployment time

      // Simulate metrics for this phase
      const phaseMetrics = this.generatePhaseMetrics(updateType, phase);
      metrics.error_rate = Math.max(metrics.error_rate, phaseMetrics.error_rate);
      metrics.response_time = Math.max(metrics.response_time, phaseMetrics.response_time);
      metrics.success_rate = Math.min(metrics.success_rate, phaseMetrics.success_rate);
      metrics.phases_completed.push({
        phase,
        error_rate: phaseMetrics.error_rate,
        response_time: phaseMetrics.response_time,
        success_rate: phaseMetrics.success_rate,
        completed_at: new Date().toISOString(),
      });
    }

    return metrics;
  }

  /**
   * Blue-green deployment simulation
   */
  private static async blueGreenDeployment(updateType: string): Promise<any> {
    logger.info('Executing blue-green deployment...');

    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate deployment time

    // Blue-green deployments typically have better reliability
    const baseMetrics = this.generatePhaseMetrics(updateType, '100%');
    const metrics = {
      error_rate: baseMetrics.error_rate * 0.5, // Better reliability
      response_time: baseMetrics.response_time,
      success_rate: baseMetrics.success_rate,
      deployment_type: 'blue-green',
      green_environment_ready: true,
      traffic_switched: true,
    };
    return metrics;
  }

  /**
   * Canary deployment simulation
   */
  private static async canaryDeployment(updateType: string): Promise<any> {
    logger.info('Executing canary deployment...');

    const canaryPhases = ['5%', '10%', '25%', '50%', '100%'];
    const metrics = {
      error_rate: 0,
      response_time: 0,
      success_rate: 100,
      canary_phases: [],
    };

    for (const phase of canaryPhases) {
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate deployment time

      const phaseMetrics = this.generatePhaseMetrics(updateType, phase);

      // Canary allows early detection of issues
      if (phaseMetrics.error_rate > 2 && phase === '5%') {
        metrics.error_rate = phaseMetrics.error_rate;
        metrics.canary_phases.push({
          phase,
          ...phaseMetrics,
          stopped_early: true,
          reason: 'High error rate detected in canary',
        });
        break;
      }

      metrics.error_rate = Math.max(metrics.error_rate, phaseMetrics.error_rate);
      metrics.response_time = Math.max(metrics.response_time, phaseMetrics.response_time);
      metrics.success_rate = Math.min(metrics.success_rate, phaseMetrics.success_rate);
      metrics.canary_phases.push({
        phase,
        ...phaseMetrics,
        completed_at: new Date().toISOString(),
      });

      logger.info(`Canary deployment phase ${phase} completed`);
    }

    return metrics;
  }

  /**
   * Generate phase metrics based on update type
   */
  private static generatePhaseMetrics(updateType: string, phase: string): any {
    // Base metrics with some randomness
    let errorRate = Math.random() * 2; // 0-2%
    let responseTime = 800 + Math.random() * 400; // 800-1200ms
    let successRate = 98 + Math.random() * 2; // 98-100%

    // Adjust based on update type (major updates are riskier)
    switch (updateType) {
      case 'major':
        errorRate *= 2;
        responseTime *= 1.2;
        successRate -= 2;
        break;
      case 'minor':
        errorRate *= 1.5;
        responseTime *= 1.1;
        successRate -= 1;
        break;
      case 'patch':
        // Patches are generally safer
        errorRate *= 0.5;
        break;
    }

    // Add some phase-specific variation
    if (phase === '100%') {
      // Full deployment may have slightly higher load
      responseTime *= 1.1;
    }

    return {
      error_rate: Math.round(errorRate * 100) / 100,
      response_time: Math.round(responseTime),
      success_rate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Check if rollback is required
   */
  private static shouldRollback(metrics: any, rollbackConditions: any): boolean {
    if (!rollbackConditions.auto_rollback_enabled) {
      return false;
    }

    const conditions = [
      metrics.error_rate > rollbackConditions.error_rate_threshold,
      metrics.response_time > rollbackConditions.response_time_threshold,
      metrics.success_rate < rollbackConditions.success_rate_threshold,
    ];

    return conditions.some(Boolean);
  }

  /**
   * Perform rollback
   */
  private static async performRollback(deploymentId: string, updatePolicy: any): Promise<void> {
    logger.info('Performing rollback...', { deploymentId });

    // Simulate rollback time
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Rollback completed', { deploymentId });
  }

  /**
   * Check if update should be auto-approved
   */
  public static shouldAutoApprove(updateType: 'patch' | 'minor' | 'major', policy: any): boolean {
    switch (updateType) {
      case 'patch':
        return policy.auto_approve_patch;
      case 'minor':
        return policy.auto_approve_minor;
      case 'major':
        return false; // Major updates never auto-approved
      default:
        return false;
    }
  }

  /**
   * Check if update can be deployed during maintenance window
   */
  public static isInMaintenanceWindow(policy: any): boolean {
    if (!policy.maintenance_windows || policy.maintenance_windows.length === 0) {
      return true; // No restrictions
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return policy.maintenance_windows.some((window: any) => {
      if (window.day_of_week !== currentDay) {
        return false;
      }

      return currentTime >= window.start_time && currentTime <= window.end_time;
    });
  }
}

/**
 * @route GET /api/updates/policies
 * @desc Get update policies for the practice
 * @access Private
 */
router.get('/policies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const result = await configService.getConfigurations(
      'update_policy',
      user.practiceId
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Update policies retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving update policies:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve update policies',
    });
  }
});

/**
 * @route POST /api/updates/policies
 * @desc Create or update deployment policy
 * @access Private
 */
router.post('/policies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = UpdatePolicySchema.safeParse({
      ...req.body,
      practice_id: req.user?.practiceId,
      created_by: req.user?.id,
      updated_by: req.user?.id,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid update policy data',
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

    const requestData = {
      type: 'update_policy' as const,
      data: validation.data,
      requires_approval: req.body.requires_approval || true, // Update policies usually require approval
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(result);

    logger.info('Update policy creation:', {
      userId: user.id,
      practiceId: user.practiceId,
      policyName: validation.data.policy_name,
      deploymentStrategy: validation.data.deployment_strategy,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error creating update policy:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create update policy',
    });
  }
});

/**
 * @route POST /api/updates/simulate
 * @desc Simulate update deployment
 * @access Private
 */
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const simulationSchema = z.object({
      policy_id: z.number().optional(),
      update_type: z.enum(['patch', 'minor', 'major']),
      deployment_strategy: z.enum(['rolling', 'blue-green', 'canary']).optional(),
      custom_policy: UpdatePolicySchema.optional(),
    });

    const validation = simulationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid simulation parameters',
      });
    }

    let updatePolicy;

    if (validation.data.custom_policy) {
      updatePolicy = validation.data.custom_policy;
    } else if (validation.data.policy_id) {
      // Get existing policy
      const policiesResult = await configService.getConfigurations(
        'update_policy',
        user.practiceId
      );

      if (!policiesResult.success || !policiesResult.data) {
        return res.status(400).json({
          success: false,
          errors: ['Failed to retrieve update policies'],
          message: 'Unable to run simulation',
        });
      }

      updatePolicy = (policiesResult.data as any[]).find(p => p.id === validation.data.policy_id);
      if (!updatePolicy) {
        return res.status(404).json({
          success: false,
          errors: ['Update policy not found'],
          message: 'Cannot simulate with non-existent policy',
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        errors: ['Either policy_id or custom_policy is required'],
        message: 'Specify an update policy for simulation',
      });
    }

    // Override deployment strategy if provided
    if (validation.data.deployment_strategy) {
      updatePolicy = {
        ...updatePolicy,
        deployment_strategy: validation.data.deployment_strategy,
      };
    }

    // Check auto-approval
    const autoApproved = UpdateManager.shouldAutoApprove(validation.data.update_type, updatePolicy);

    // Check maintenance window
    const inMaintenanceWindow = UpdateManager.isInMaintenanceWindow(updatePolicy);

    // Run deployment simulation
    const deploymentResult = await UpdateManager.simulateDeployment(
      updatePolicy,
      validation.data.update_type
    );

    res.json({
      success: true,
      data: {
        simulation_id: `sim_${Date.now()}`,
        update_type: validation.data.update_type,
        policy_used: updatePolicy,
        auto_approved: autoApproved,
        in_maintenance_window: inMaintenanceWindow,
        deployment_result: deploymentResult,
        recommendations: generateRecommendations(deploymentResult, updatePolicy),
      },
      message: 'Update deployment simulation completed',
    });

    logger.info('Update deployment simulation:', {
      userId: user.id,
      practiceId: user.practiceId,
      updateType: validation.data.update_type,
      deploymentStrategy: updatePolicy.deployment_strategy,
      success: deploymentResult.success,
      rollbackRequired: deploymentResult.rollback_required,
    });
  } catch (error) {
    logger.error('Error running update simulation:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to run update simulation',
    });
  }
});

/**
 * @route GET /api/updates/status
 * @desc Get current update status and pending updates
 * @access Private
 */
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Get update policies
    const policiesResult = await configService.getConfigurations(
      'update_policy',
      user.practiceId
    );

    const policies = policiesResult.success ? policiesResult.data : [];

    // Simulate some pending updates
    const pendingUpdates = [
      {
        update_id: 'update_001',
        type: 'patch',
        description: 'Security patch for authentication system',
        severity: 'high',
        estimated_duration: '15 minutes',
        requires_approval: false,
        scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        update_id: 'update_002',
        type: 'minor',
        description: 'Enhanced appointment scheduling features',
        severity: 'medium',
        estimated_duration: '45 minutes',
        requires_approval: true,
        scheduled_for: null,
      },
    ];

    // Get active deployment policy
    const activePolicy = policies && (policies as any[]).length > 0 ? (policies as any[])[0] : null;

    res.json({
      success: true,
      data: {
        practice_id: user.practiceId,
        active_policy: activePolicy,
        total_policies: policies ? policies.length : 0,
        pending_updates: pendingUpdates,
        maintenance_window_status: activePolicy
          ? UpdateManager.isInMaintenanceWindow(activePolicy)
          : null,
        last_deployment: {
          deployment_id: 'deploy_prev_001',
          completed_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'patch',
          status: 'success',
        },
      },
      message: 'Update status retrieved successfully',
    });

    logger.info('Update status check:', {
      userId: user.id,
      practiceId: user.practiceId,
      pendingUpdates: pendingUpdates.length,
      hasActivePolicy: !!activePolicy,
    });
  } catch (error) {
    logger.error('Error getting update status:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to get update status',
    });
  }
});

/**
 * @route POST /api/updates/approve/:update_id
 * @desc Approve pending update
 * @access Private
 */
router.post('/approve/:update_id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    if (user.role !== 'admin' && user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        errors: ['Insufficient permissions'],
        message: 'Only administrators and managers can approve updates',
      });
    }

    const { update_id } = req.params;
    const { comments, scheduled_time } = req.body;

    // In a real implementation, this would:
    // 1. Validate the update exists
    // 2. Check user permissions
    // 3. Schedule the update
    // 4. Send notifications

    res.json({
      success: true,
      data: {
        update_id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        comments,
        scheduled_time: scheduled_time || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      message: 'Update approved successfully',
    });

    logger.info('Update approval:', {
      userId: user.id,
      practiceId: user.practiceId,
      updateId: update_id,
      comments,
    });
  } catch (error) {
    logger.error('Error approving update:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to approve update',
    });
  }
});

// Helper function to generate recommendations
function generateRecommendations(deploymentResult: any, policy: any): string[] {
  const recommendations = [];

  if (deploymentResult.rollback_required) {
    recommendations.push('Consider adjusting rollback thresholds to be less strict');
    recommendations.push('Review deployment strategy - blue-green deployments have lower rollback rates');
  }

  if (deploymentResult.metrics.error_rate > 1) {
    recommendations.push('High error rate detected - consider additional testing before deployment');
  }

  if (deploymentResult.metrics.response_time > 1500) {
    recommendations.push('Response time increased - monitor performance during deployment');
  }

  if (policy.deployment_strategy === 'rolling' && deploymentResult.rollback_required) {
    recommendations.push('Consider switching to canary deployment for better early detection');
  }

  if (!policy.maintenance_windows || policy.maintenance_windows.length === 0) {
    recommendations.push('Configure maintenance windows to minimize user impact');
  }

  return recommendations;
}

/**
 * @route POST /api/updates/pipeline
 * @desc Create update pipeline configuration
 * @access Private
 */
router.post('/pipeline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const pipelineSchema = z.object({
      pipelineName: z.string(),
      environments: z.array(z.object({
        name: z.string(),
        order: z.number(),
        autoPromote: z.boolean().default(false),
        approvalRequired: z.boolean().default(true),
        healthChecks: z.array(z.object({
          name: z.string(),
          type: z.enum(['HTTP', 'TCP', 'DATABASE', 'CUSTOM']),
          endpoint: z.string().optional(),
          expectedStatus: z.number().optional(),
          timeoutSeconds: z.number().default(30),
          retryCount: z.number().default(3),
          intervalSeconds: z.number().default(10),
        })),
        deploymentTimeoutMinutes: z.number().default(30),
        rollbackTimeoutMinutes: z.number().default(10),
      })),
      deploymentStrategy: z.enum(['rolling', 'blue-green', 'canary']),
      autoPromote: z.boolean().default(false),
      rollbackPolicy: z.object({
        enabled: z.boolean().default(true),
        automatic: z.boolean().default(true),
        conditions: z.array(z.object({
          metric: z.string(),
          operator: z.enum(['>', '<', '>=', '<=', '==', '!=']),
          threshold: z.number(),
          duration: z.number(),
        })),
        maxRollbackAttempts: z.number().default(3),
      }),
      notificationSettings: z.object({
        enabled: z.boolean().default(true),
        channels: z.array(z.object({
          type: z.enum(['EMAIL', 'SLACK', 'WEBHOOK', 'SMS']),
          destination: z.string(),
          severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
        })),
        events: z.array(z.object({
          event: z.enum(['PIPELINE_START', 'STAGE_SUCCESS', 'STAGE_FAILURE', 'PIPELINE_SUCCESS', 'PIPELINE_FAILURE', 'ROLLBACK_START', 'ROLLBACK_SUCCESS']),
          enabled: z.boolean(),
        })),
      }),
    });

    const validation = pipelineSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid pipeline configuration',
      });
    }

    const pipelineConfig = {
      ...validation.data,
      practiceId: user.practiceId,
    };

    const result = await pipelineService.createPipeline(pipelineConfig);

    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json({
      success: result.success,
      data: { pipelineId: result.pipelineId },
      message: result.message,
    });

    logger.info('Update pipeline creation:', {
      userId: user.id,
      practiceId: user.practiceId,
      pipelineId: result.pipelineId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error creating update pipeline:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create update pipeline',
    });
  }
});

/**
 * @route POST /api/updates/pipeline/:pipelineId/execute
 * @desc Execute update pipeline
 * @access Private
 */
router.post('/pipeline/:pipelineId/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { pipelineId } = req.params;
    const executionSchema = z.object({
      version: z.string(),
      triggerType: z.enum(['MANUAL', 'AUTOMATIC', 'SCHEDULED']).default('MANUAL'),
    });

    const validation = executionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid execution parameters',
      });
    }

    const execution = await pipelineService.executePipeline(
      pipelineId,
      validation.data.triggerType,
      user.id,
      validation.data.version
    );

    res.status(202).json({
      success: execution.status !== 'FAILED',
      data: execution,
      message: `Pipeline execution ${execution.status === 'FAILED' ? 'failed' : 'started'}`,
    });

    logger.info('Pipeline execution started:', {
      userId: user.id,
      practiceId: user.practiceId,
      pipelineId,
      executionId: execution.executionId,
      version: validation.data.version,
    });
  } catch (error) {
    logger.error('Error executing pipeline:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to execute pipeline',
    });
  }
});

/**
 * @route POST /api/updates/environments
 * @desc Create staging environment
 * @access Private
 */
router.post('/environments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const environmentSchema = z.object({
      name: z.string(),
      type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
    });

    const validation = environmentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid environment configuration',
      });
    }

    const environment = await pipelineService.createStagingEnvironment(
      user.practiceId,
      validation.data.name,
      validation.data.type
    );

    res.status(201).json({
      success: true,
      data: environment,
      message: 'Staging environment created successfully',
    });

    logger.info('Staging environment created:', {
      userId: user.id,
      practiceId: user.practiceId,
      environmentId: environment.environmentId,
      environmentName: validation.data.name,
      type: validation.data.type,
    });
  } catch (error) {
    logger.error('Error creating staging environment:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create staging environment',
    });
  }
});

/**
 * @route GET /api/updates/environments/:environmentId/deployments
 * @desc Get deployment history for environment
 * @access Private
 */
router.get('/environments/:environmentId/deployments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { environmentId } = req.params;
    const deployments = await pipelineService.getDeploymentHistory(environmentId);

    res.json({
      success: true,
      data: deployments,
      message: 'Deployment history retrieved successfully',
    });

    logger.info('Deployment history retrieved:', {
      userId: user.id,
      practiceId: user.practiceId,
      environmentId,
      deploymentCount: deployments.length,
    });
  } catch (error) {
    logger.error('Error retrieving deployment history:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve deployment history',
    });
  }
});

/**
 * @route POST /api/updates/environments/:environmentId/rollback
 * @desc Rollback to previous deployment
 * @access Private
 */
router.post('/environments/:environmentId/rollback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    if (user.role !== 'admin' && user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        errors: ['Insufficient permissions'],
        message: 'Only administrators and managers can perform rollbacks',
      });
    }

    const { environmentId } = req.params;
    const rollbackSchema = z.object({
      targetDeploymentId: z.string(),
      reason: z.string(),
    });

    const validation = rollbackSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid rollback parameters',
      });
    }

    const result = await pipelineService.rollbackDeployment(
      environmentId,
      validation.data.targetDeploymentId,
      validation.data.reason
    );

    const statusCode = result.success ? 202 : 400;
    res.status(statusCode).json({
      success: result.success,
      data: { rollbackId: result.rollbackId },
      message: result.message,
    });

    logger.info('Deployment rollback initiated:', {
      userId: user.id,
      practiceId: user.practiceId,
      environmentId,
      targetDeploymentId: validation.data.targetDeploymentId,
      rollbackId: result.rollbackId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error performing rollback:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to perform rollback',
    });
  }
});

export default router;