import express, { Request, Response } from 'express';
import { z } from 'zod';
import ConfigurationService from '../services/configurationService';
import { BackupSettingsSchema } from '../models/configuration.models';
import winston from 'winston';
import cron from 'node-cron';

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

// Middleware to extract user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    practiceId: string;
    role: string;
  };
}

// Backup Management Service
class BackupManager {
  private static scheduledJobs: Map<string, any> = new Map();

  /**
   * Schedule backup job
   */
  public static scheduleBackup(backupConfig: any): void {
    const jobKey = `${backupConfig.practice_id}_${backupConfig.backup_type}`;

    // Cancel existing job if it exists
    if (this.scheduledJobs.has(jobKey)) {
      this.scheduledJobs.get(jobKey).stop();
      this.scheduledJobs.delete(jobKey);
    }

    // Validate cron expression
    if (!cron.validate(backupConfig.schedule_cron)) {
      throw new Error(`Invalid cron expression: ${backupConfig.schedule_cron}`);
    }

    // Schedule new job
    const job = cron.schedule(backupConfig.schedule_cron, async () => {
      try {
        await this.executeBackup(backupConfig);
      } catch (error) {
        logger.error('Scheduled backup failed:', {
          practiceId: backupConfig.practice_id,
          backupType: backupConfig.backup_type,
          error,
        });
      }
    }, {
      scheduled: false,
    });

    this.scheduledJobs.set(jobKey, job);
    job.start();

    logger.info('Backup job scheduled:', {
      practiceId: backupConfig.practice_id,
      backupType: backupConfig.backup_type,
      schedule: backupConfig.schedule_cron,
    });
  }

  /**
   * Execute backup
   */
  public static async executeBackup(backupConfig: any): Promise<{
    success: boolean;
    backup_id: string;
    backup_location: string;
    backup_size: number;
    duration_seconds: number;
    created_at: string;
  }> {
    const startTime = Date.now();
    const backupId = `backup_${backupConfig.practice_id}_${backupConfig.backup_type}_${startTime}`;

    logger.info('Starting backup:', {
      backupId,
      practiceId: backupConfig.practice_id,
      backupType: backupConfig.backup_type,
    });

    try {
      // Simulate backup process based on type
      let backupSize = 0;
      const backupLocation = `${backupConfig.backup_location}/${backupId}`;

      switch (backupConfig.backup_type) {
        case 'database':
          backupSize = await this.performDatabaseBackup(backupConfig, backupLocation);
          break;
        case 'files':
          backupSize = await this.performFileBackup(backupConfig, backupLocation);
          break;
        case 'logs':
          backupSize = await this.performLogBackup(backupConfig, backupLocation);
          break;
        case 'full':
          backupSize = await this.performFullBackup(backupConfig, backupLocation);
          break;
        default:
          throw new Error(`Unsupported backup type: ${backupConfig.backup_type}`);
      }

      const duration = (Date.now() - startTime) / 1000;

      // Send notifications if configured
      if (backupConfig.notification_emails && backupConfig.notification_emails.length > 0) {
        await this.sendBackupNotification(backupConfig, {
          status: 'success',
          backup_id: backupId,
          size: backupSize,
          duration,
        });
      }

      logger.info('Backup completed successfully:', {
        backupId,
        practiceId: backupConfig.practice_id,
        backupType: backupConfig.backup_type,
        size: backupSize,
        duration,
      });

      return {
        success: true,
        backup_id: backupId,
        backup_location: backupLocation,
        backup_size: backupSize,
        duration_seconds: duration,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      // Send failure notification
      if (backupConfig.notification_emails && backupConfig.notification_emails.length > 0) {
        await this.sendBackupNotification(backupConfig, {
          status: 'failed',
          backup_id: backupId,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });
      }

      logger.error('Backup failed:', {
        backupId,
        practiceId: backupConfig.practice_id,
        backupType: backupConfig.backup_type,
        error,
        duration,
      });

      throw error;
    }
  }

  /**
   * Perform database backup
   */
  private static async performDatabaseBackup(config: any, location: string): Promise<number> {
    // Simulate database backup process
    logger.info('Performing database backup...', { location });

    // In a real implementation, this would:
    // 1. Connect to PostgreSQL
    // 2. Run pg_dump with appropriate options
    // 3. Compress if config.compression_enabled
    // 4. Encrypt if config.encryption_enabled
    // 5. Upload to S3/backup location

    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate backup time

    // Return simulated backup size (in bytes)
    return 1024 * 1024 * 150; // 150 MB
  }

  /**
   * Perform file backup
   */
  private static async performFileBackup(config: any, location: string): Promise<number> {
    logger.info('Performing file backup...', { location });

    // In a real implementation, this would:
    // 1. Archive application files
    // 2. Include configuration files
    // 3. Compress if enabled
    // 4. Encrypt if enabled
    // 5. Upload to backup location

    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate backup time

    return 1024 * 1024 * 50; // 50 MB
  }

  /**
   * Perform log backup
   */
  private static async performLogBackup(config: any, location: string): Promise<number> {
    logger.info('Performing log backup...', { location });

    // In a real implementation, this would:
    // 1. Archive log files
    // 2. Include audit logs for HIPAA compliance
    // 3. Compress and encrypt
    // 4. Upload to backup location

    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate backup time

    return 1024 * 1024 * 25; // 25 MB
  }

  /**
   * Perform full system backup
   */
  private static async performFullBackup(config: any, location: string): Promise<number> {
    logger.info('Performing full system backup...', { location });

    // Combine all backup types
    const dbSize = await this.performDatabaseBackup(config, `${location}/database`);
    const fileSize = await this.performFileBackup(config, `${location}/files`);
    const logSize = await this.performLogBackup(config, `${location}/logs`);

    return dbSize + fileSize + logSize;
  }

  /**
   * Send backup notification
   */
  private static async sendBackupNotification(config: any, result: any): Promise<void> {
    // In a real implementation, this would send email notifications
    logger.info('Sending backup notification:', {
      emails: config.notification_emails,
      status: result.status,
      backupId: result.backup_id,
    });

    // Mock email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Test backup configuration
   */
  public static async testBackupConfiguration(config: any): Promise<{
    success: boolean;
    tests: any[];
    overall_score: number;
  }> {
    const tests = [];

    // Test cron expression
    tests.push({
      test: 'cron_expression',
      result: cron.validate(config.schedule_cron),
      message: cron.validate(config.schedule_cron)
        ? 'Cron expression is valid'
        : 'Invalid cron expression format',
    });

    // Test backup location accessibility
    tests.push({
      test: 'backup_location',
      result: config.backup_location && config.backup_location.length > 0,
      message: config.backup_location
        ? 'Backup location specified'
        : 'Backup location is required',
    });

    // Test retention period
    const retentionValid = config.retention_days >= 7 && config.retention_days <= 2555;
    tests.push({
      test: 'retention_period',
      result: retentionValid,
      message: retentionValid
        ? `Retention period: ${config.retention_days} days`
        : 'Retention period should be between 7 days and 7 years',
    });

    // Test encryption for sensitive data
    if (config.backup_type === 'database' || config.backup_type === 'full') {
      tests.push({
        test: 'encryption_enabled',
        result: config.encryption_enabled,
        message: config.encryption_enabled
          ? 'Encryption enabled for sensitive data'
          : 'Warning: Encryption disabled for database backup',
      });
    }

    // Test notification configuration
    tests.push({
      test: 'notifications',
      result: config.notification_emails && config.notification_emails.length > 0,
      message: config.notification_emails && config.notification_emails.length > 0
        ? `${config.notification_emails.length} notification email(s) configured`
        : 'No notification emails configured',
    });

    const passedTests = tests.filter(test => test.result).length;
    const overallScore = (passedTests / tests.length) * 100;

    return {
      success: overallScore >= 80,
      tests,
      overall_score: overallScore,
    };
  }

  /**
   * Get backup status
   */
  public static getBackupStatus(practiceId: string): any {
    const jobs = Array.from(this.scheduledJobs.entries())
      .filter(([key]) => key.startsWith(practiceId))
      .map(([key, job]) => ({
        job_key: key,
        is_running: job.running,
        next_run: job.nextDate ? job.nextDate().toISOString() : null,
      }));

    return {
      practice_id: practiceId,
      scheduled_jobs: jobs,
      total_jobs: jobs.length,
      active_jobs: jobs.filter(job => job.is_running).length,
    };
  }
}

/**
 * @route GET /api/backup/settings
 * @desc Get backup settings for the practice
 * @access Private
 */
router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
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
      'backup_settings',
      user.practiceId
    );

    res.status(result.success ? 200 : 400).json(result);

    logger.info('Backup settings retrieval:', {
      userId: user.id,
      practiceId: user.practiceId,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error retrieving backup settings:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to retrieve backup settings',
    });
  }
});

/**
 * @route POST /api/backup/settings
 * @desc Create or update backup settings
 * @access Private
 */
router.post('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = BackupSettingsSchema.safeParse({
      ...req.body,
      practice_id: req.user?.practiceId,
      created_by: req.user?.id,
      updated_by: req.user?.id,
    });

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        message: 'Invalid backup settings data',
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

    // Test the backup configuration
    const testResult = await BackupManager.testBackupConfiguration(validation.data);

    const requestData = {
      type: 'backup_settings' as const,
      data: validation.data,
      requires_approval: req.body.requires_approval || testResult.overall_score < 80,
    };

    const result = await configService.createConfiguration(
      requestData,
      user.id,
      user.practiceId,
      req.ip,
      req.get('User-Agent')
    );

    // If configuration was created successfully and doesn't require approval, schedule the backup
    if (result.success && !result.approval_required) {
      try {
        BackupManager.scheduleBackup(validation.data);
      } catch (error) {
        logger.warn('Failed to schedule backup job:', error);
        // Don't fail the request, just log the warning
      }
    }

    const response = {
      ...result,
      test_results: testResult,
    };

    const statusCode = result.success ? (result.approval_required ? 202 : 201) : 400;
    res.status(statusCode).json(response);

    logger.info('Backup settings creation:', {
      userId: user.id,
      practiceId: user.practiceId,
      backupType: validation.data.backup_type,
      testScore: testResult.overall_score,
      success: result.success,
    });
  } catch (error) {
    logger.error('Error creating backup settings:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to create backup settings',
    });
  }
});

/**
 * @route POST /api/backup/execute/:type
 * @desc Execute immediate backup
 * @access Private
 */
router.post('/execute/:type', async (req: AuthenticatedRequest, res: Response) => {
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

    if (!['database', 'files', 'logs', 'full'].includes(type)) {
      return res.status(400).json({
        success: false,
        errors: ['Invalid backup type'],
        message: 'Backup type must be: database, files, logs, or full',
      });
    }

    // Get backup settings for this practice
    const settingsResult = await configService.getConfigurations(
      'backup_settings',
      user.practiceId
    );

    if (!settingsResult.success || !settingsResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Backup settings not configured'],
        message: 'Configure backup settings before executing backup',
      });
    }

    const backupSettings = (settingsResult.data as any[]).find(
      setting => setting.backup_type === type
    );

    if (!backupSettings) {
      return res.status(404).json({
        success: false,
        errors: [`No backup configuration found for type: ${type}`],
        message: 'Configure this backup type before executing',
      });
    }

    // Execute the backup
    const backupResult = await BackupManager.executeBackup(backupSettings);

    res.json({
      success: true,
      data: backupResult,
      message: 'Backup executed successfully',
    });

    logger.info('Manual backup execution:', {
      userId: user.id,
      practiceId: user.practiceId,
      backupType: type,
      backupId: backupResult.backup_id,
      size: backupResult.backup_size,
      duration: backupResult.duration_seconds,
    });
  } catch (error) {
    logger.error('Error executing backup:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to execute backup',
    });
  }
});

/**
 * @route POST /api/backup/test/:type
 * @desc Test backup configuration
 * @access Private
 */
router.post('/test/:type', async (req: AuthenticatedRequest, res: Response) => {
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

    // Get backup settings for this practice
    const settingsResult = await configService.getConfigurations(
      'backup_settings',
      user.practiceId
    );

    if (!settingsResult.success || !settingsResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['Backup settings not configured'],
        message: 'Configure backup settings before testing',
      });
    }

    const backupSettings = (settingsResult.data as any[]).find(
      setting => setting.backup_type === type
    );

    if (!backupSettings) {
      return res.status(404).json({
        success: false,
        errors: [`No backup configuration found for type: ${type}`],
        message: 'Configure this backup type before testing',
      });
    }

    // Test the backup configuration
    const testResult = await BackupManager.testBackupConfiguration(backupSettings);

    res.json({
      success: true,
      data: {
        backup_type: type,
        configuration: backupSettings,
        test_results: testResult,
      },
      message: 'Backup configuration test completed',
    });

    logger.info('Backup configuration test:', {
      userId: user.id,
      practiceId: user.practiceId,
      backupType: type,
      testScore: testResult.overall_score,
      passed: testResult.success,
    });
  } catch (error) {
    logger.error('Error testing backup configuration:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to test backup configuration',
    });
  }
});

/**
 * @route GET /api/backup/status
 * @desc Get backup job status
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

    const status = BackupManager.getBackupStatus(user.practiceId);

    res.json({
      success: true,
      data: status,
      message: 'Backup status retrieved successfully',
    });

    logger.info('Backup status check:', {
      userId: user.id,
      practiceId: user.practiceId,
      totalJobs: status.total_jobs,
      activeJobs: status.active_jobs,
    });
  } catch (error) {
    logger.error('Error getting backup status:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to get backup status',
    });
  }
});

/**
 * @route POST /api/backup/schedule
 * @desc Schedule or reschedule backup jobs
 * @access Private
 */
router.post('/schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({
        success: false,
        errors: ['Authentication required'],
        message: 'User not authenticated',
      });
    }

    // Get all backup settings for this practice
    const settingsResult = await configService.getConfigurations(
      'backup_settings',
      user.practiceId
    );

    if (!settingsResult.success || !settingsResult.data) {
      return res.status(400).json({
        success: false,
        errors: ['No backup settings configured'],
        message: 'Configure backup settings before scheduling',
      });
    }

    const scheduledJobs = [];
    const failedJobs = [];

    // Schedule all configured backup types
    for (const backupConfig of settingsResult.data as any[]) {
      try {
        BackupManager.scheduleBackup(backupConfig);
        scheduledJobs.push({
          backup_type: backupConfig.backup_type,
          schedule: backupConfig.schedule_cron,
          status: 'scheduled',
        });
      } catch (error) {
        failedJobs.push({
          backup_type: backupConfig.backup_type,
          schedule: backupConfig.schedule_cron,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      success: failedJobs.length === 0,
      data: {
        scheduled_jobs: scheduledJobs,
        failed_jobs: failedJobs,
        total_configurations: (settingsResult.data as any[]).length,
      },
      message: failedJobs.length === 0
        ? 'All backup jobs scheduled successfully'
        : `${scheduledJobs.length} jobs scheduled, ${failedJobs.length} failed`,
    });

    logger.info('Backup scheduling:', {
      userId: user.id,
      practiceId: user.practiceId,
      scheduled: scheduledJobs.length,
      failed: failedJobs.length,
    });
  } catch (error) {
    logger.error('Error scheduling backups:', error);
    res.status(500).json({
      success: false,
      errors: ['Internal server error'],
      message: 'Failed to schedule backup jobs',
    });
  }
});

export default router;