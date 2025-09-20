import express, { Request, Response } from 'express';
import { z } from 'zod';
import winston from 'winston';
import RecoveryService from '../services/recoveryService';
import BackupTestingService from '../services/backupTestingService';
import BackupMonitoringService from '../services/backupMonitoringService';
import AWSBackupService from '../services/awsBackupService';

const router = express.Router();
const recoveryService = new RecoveryService();
const testingService = new BackupTestingService();
const monitoringService = new BackupMonitoringService();
const awsBackupService = new AWSBackupService();

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

// Validation schemas
const RecoveryExecutionSchema = z.object({
  procedureId: z.string(),
  executorId: z.string(),
});

const TestSuiteExecutionSchema = z.object({
  testSuiteId: z.string().optional(),
  createStandard: z.boolean().default(false),
});

const MonitoringConfigSchema = z.object({
  monitoringEnabled: z.boolean().default(true),
  alertThresholds: z.object({
    backupFailureCount: z.number().min(1).default(3),
    backupDelayMinutes: z.number().min(60).default(1440),
    storageUsagePercent: z.number().min(50).max(100).default(85),
    restoreTimeMinutes: z.number().min(30).default(120),
    dataIntegrityScore: z.number().min(0).max(100).default(95),
  }),
  notificationChannels: z.array(z.object({
    type: z.enum(['EMAIL', 'SMS', 'WEBHOOK', 'SLACK']),
    destination: z.string(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    enabled: z.boolean().default(true),
  })).default([]),
  checkIntervalMinutes: z.number().min(5).max(1440).default(60),
  retentionDays: z.number().min(7).max(365).default(90),
});

/**
 * @route GET /api/recovery/procedures
 * @desc Get available recovery procedures
 * @access Private
 */
router.get('/procedures', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const procedures = recoveryService.getStandardRecoveryProcedures();

    res.json({
      success: true,
      data: procedures,
      message: 'Recovery procedures retrieved successfully',
    });

    logger.info('Recovery procedures retrieved:', {
      userId: user.id,
      practiceId: user.practiceId,
      procedureCount: procedures.length,
    });
  } catch (error) {
    logger.error('Error retrieving recovery procedures:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve recovery procedures',
    });
  }
});

/**
 * @route POST /api/recovery/disaster-plan
 * @desc Create disaster recovery plan
 * @access Private
 */
router.post('/disaster-plan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const plan = await recoveryService.createDisasterRecoveryPlan(user.practiceId);

    res.status(201).json({
      success: true,
      data: plan,
      message: 'Disaster recovery plan created successfully',
    });

    logger.info('Disaster recovery plan created:', {
      userId: user.id,
      practiceId: user.practiceId,
      planVersion: plan.planVersion,
    });
  } catch (error) {
    logger.error('Error creating disaster recovery plan:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create disaster recovery plan',
    });
  }
});

/**
 * @route POST /api/recovery/execute
 * @desc Execute recovery procedure
 * @access Private
 */
router.post('/execute', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = RecoveryExecutionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid recovery execution data',
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

    // Check if user has required role for recovery operations
    if (!['system-admin', 'database-admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        errors: ['Insufficient permissions'],
        message: 'Recovery operations require system-admin or database-admin role',
      });
    }

    const result = await recoveryService.executeRecovery(
      user.practiceId,
      validation.data.procedureId,
      validation.data.executorId
    );

    const statusCode = result.success ? 202 : 400;
    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.message,
    });

    logger.info('Recovery execution started:', {
      userId: user.id,
      practiceId: user.practiceId,
      procedureId: validation.data.procedureId,
      executionId: result.executionId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error executing recovery procedure:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to execute recovery procedure',
    });
  }
});

/**
 * @route POST /api/recovery/test/:procedureId
 * @desc Test recovery procedure
 * @access Private
 */
router.post('/test/:procedureId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const { procedureId } = req.params;
    const dryRun = req.query.dryRun === 'true';

    const testResult = await recoveryService.testRecoveryProcedure(
      user.practiceId,
      procedureId,
      dryRun
    );

    res.json({
      success: testResult.success,
      data: testResult,
      message: `Recovery procedure test ${testResult.success ? 'passed' : 'failed'}`,
    });

    logger.info('Recovery procedure test completed:', {
      userId: user.id,
      practiceId: user.practiceId,
      procedureId,
      testId: testResult.testId,
      success: testResult.success,
      dryRun,
    });
  } catch (error) {
    logger.error('Error testing recovery procedure:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to test recovery procedure',
    });
  }
});

/**
 * @route GET /api/recovery/runbook
 * @desc Generate recovery runbook documentation
 * @access Private
 */
router.get('/runbook', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const runbook = await recoveryService.generateRunbook(user.practiceId);

    res.set({
      'Content-Type': 'text/markdown',
      'Content-Disposition': `attachment; filename="recovery-runbook-${user.practiceId}.md"`,
    });

    res.send(runbook);

    logger.info('Recovery runbook generated:', {
      userId: user.id,
      practiceId: user.practiceId,
    });
  } catch (error) {
    logger.error('Error generating recovery runbook:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to generate recovery runbook',
    });
  }
});

/**
 * @route POST /api/recovery/backup-testing/suite
 * @desc Create or execute backup test suite
 * @access Private
 */
router.post('/backup-testing/suite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = TestSuiteExecutionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid test suite request',
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

    let testSuite;
    if (validation.data.createStandard) {
      // Create standard test suite
      testSuite = await testingService.createStandardTestSuite(user.practiceId);
    }

    const testSuiteId = validation.data.testSuiteId || testSuite?.id;
    if (!testSuiteId) {
      return res.status(400).json({
        success: false,
        errors: ['Test suite ID required'],
        message: 'Must provide testSuiteId or set createStandard to true',
      });
    }

    // Execute test suite
    const execution = await testingService.executeTestSuite(testSuiteId);

    res.status(201).json({
      success: execution.status === 'COMPLETED',
      data: {
        testSuite: testSuite || { id: testSuiteId },
        execution,
      },
      message: `Test suite ${execution.status === 'COMPLETED' ? 'completed successfully' : 'execution failed'}`,
    });

    logger.info('Backup test suite executed:', {
      userId: user.id,
      practiceId: user.practiceId,
      testSuiteId,
      executionId: execution.executionId,
      overallScore: execution.overallScore,
    });
  } catch (error) {
    logger.error('Error executing backup test suite:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to execute backup test suite',
    });
  }
});

/**
 * @route POST /api/recovery/monitoring/setup
 * @desc Setup backup monitoring and alerting
 * @access Private
 */
router.post('/monitoring/setup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = MonitoringConfigSchema.safeParse({
      ...req.body,
      practiceId: req.user?.practiceId,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid monitoring configuration',
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

    const config = {
      ...validation.data,
      practiceId: user.practiceId,
    };

    const result = await monitoringService.setupMonitoring(config);

    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json({
      success: result.success,
      data: { monitoringId: result.monitoringId, config },
      message: result.message,
    });

    logger.info('Backup monitoring setup:', {
      userId: user.id,
      practiceId: user.practiceId,
      monitoringId: result.monitoringId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error setting up backup monitoring:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to setup backup monitoring',
    });
  }
});

/**
 * @route GET /api/recovery/monitoring/health
 * @desc Get backup health metrics
 * @access Private
 */
router.get('/monitoring/health', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Get monitoring configuration
    const config = {
      practiceId: user.practiceId,
      monitoringEnabled: true,
      alertThresholds: {
        backupFailureCount: 3,
        backupDelayMinutes: 1440,
        storageUsagePercent: 85,
        restoreTimeMinutes: 120,
        dataIntegrityScore: 95,
      },
      notificationChannels: [],
      checkIntervalMinutes: 60,
      retentionDays: 90,
    };

    const healthMetrics = await monitoringService.performHealthCheck(config);

    res.json({
      success: true,
      data: healthMetrics,
      message: 'Backup health metrics retrieved successfully',
    });

    logger.info('Backup health check performed:', {
      userId: user.id,
      practiceId: user.practiceId,
      overallHealth: healthMetrics.overallHealth,
      activeAlerts: healthMetrics.activeAlerts,
    });
  } catch (error) {
    logger.error('Error getting backup health metrics:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to get backup health metrics',
    });
  }
});

/**
 * @route GET /api/recovery/monitoring/report
 * @desc Generate backup performance report
 * @access Private
 */
router.get('/monitoring/report', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Parse date range from query parameters
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date(); // Default: now

    const report = await monitoringService.generatePerformanceReport(
      user.practiceId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: report,
      message: 'Backup performance report generated successfully',
    });

    logger.info('Backup performance report generated:', {
      userId: user.id,
      practiceId: user.practiceId,
      reportPeriod: report.reportPeriod,
      totalBackups: report.summary.totalBackups,
    });
  } catch (error) {
    logger.error('Error generating backup performance report:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to generate backup performance report',
    });
  }
});

/**
 * @route POST /api/recovery/aws-backup/setup
 * @desc Setup AWS Backup service for automated backups
 * @access Private
 */
router.post('/aws-backup/setup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const config = {
      practiceId: user.practiceId,
      backupType: req.body.backupType || 'full',
      scheduleCron: req.body.scheduleCron || '0 2 * * *',
      retentionDays: req.body.retentionDays || 90,
      encryptionEnabled: req.body.encryptionEnabled !== false,
      compressionEnabled: req.body.compressionEnabled !== false,
      notificationEmails: req.body.notificationEmails || [],
    };

    const result = await awsBackupService.setupBackupService(config);

    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json({
      success: result.success,
      data: {
        backupPlanId: result.backupPlanId,
        backupVaultName: result.backupVaultName,
        config,
      },
      message: result.message,
    });

    logger.info('AWS Backup service setup:', {
      userId: user.id,
      practiceId: user.practiceId,
      backupPlanId: result.backupPlanId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error setting up AWS Backup service:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to setup AWS Backup service',
    });
  }
});

/**
 * @route GET /api/recovery/aws-backup/recovery-points
 * @desc List available recovery points
 * @access Private
 */
router.get('/aws-backup/recovery-points', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    const resourceArn = req.query.resourceArn as string;
    const recoveryPoints = await awsBackupService.listRecoveryPoints(user.practiceId, resourceArn);

    res.json({
      success: true,
      data: recoveryPoints,
      message: 'Recovery points retrieved successfully',
    });

    logger.info('Recovery points retrieved:', {
      userId: user.id,
      practiceId: user.practiceId,
      count: recoveryPoints.length,
    });
  } catch (error) {
    logger.error('Error retrieving recovery points:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve recovery points',
    });
  }
});

export default router;