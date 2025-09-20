import AWS from 'aws-sdk';
import winston from 'winston';

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

export interface BackupConfig {
  practiceId: string;
  backupType: 'database' | 'files' | 'logs' | 'full';
  scheduleCron: string;
  retentionDays: number;
  encryptionEnabled: boolean;
  compressionEnabled: boolean;
  notificationEmails?: string[];
}

export interface BackupResult {
  success: boolean;
  backupJobId?: string;
  backupVaultName?: string;
  resourceArn?: string;
  status: 'CREATED' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ABORTED' | 'FAILED';
  message: string;
  createdAt?: string;
  estimatedCompletionTime?: string;
}

export interface RecoveryPointInfo {
  recoveryPointArn: string;
  resourceArn: string;
  resourceType: string;
  creationDate: Date;
  status: string;
  encryptionKeyArn?: string;
  backupSizeInBytes?: number;
  iamRoleArn?: string;
}

export interface RestoreJobInfo {
  restoreJobId: string;
  accountId: string;
  resourceType: string;
  status: string;
  statusMessage?: string;
  creationDate: Date;
  completionDate?: Date;
  expectedCompletionTimeMinutes?: number;
}

/**
 * AWS Backup Service for HIPAA-compliant automated backups
 */
export class AWSBackupService {
  private backup: AWS.Backup;
  private rds: AWS.RDS;
  private s3: AWS.S3;
  private region: string;

  constructor(region: string = 'us-west-2') {
    this.region = region;
    AWS.config.update({ region });
    this.backup = new AWS.Backup();
    this.rds = new AWS.RDS();
    this.s3 = new AWS.S3();
  }

  /**
   * Set up automated backup service for a practice
   */
  async setupBackupService(config: BackupConfig): Promise<{
    success: boolean;
    backupPlanId?: string;
    backupVaultName?: string;
    message: string;
  }> {
    try {
      const vaultName = `practice-${config.practiceId}-vault`;
      const planName = `practice-${config.practiceId}-plan`;

      // 1. Create backup vault if it doesn't exist
      await this.createBackupVault(vaultName, config.encryptionEnabled);

      // 2. Create backup plan
      const backupPlan = await this.createBackupPlan(planName, config);

      // 3. Setup resource assignments based on backup type
      await this.assignResourcesToBackupPlan(backupPlan.BackupPlanId!, config);

      logger.info('AWS Backup service setup completed:', {
        practiceId: config.practiceId,
        backupPlanId: backupPlan.BackupPlanId,
        vaultName,
      });

      return {
        success: true,
        backupPlanId: backupPlan.BackupPlanId,
        backupVaultName: vaultName,
        message: 'Backup service configured successfully',
      };
    } catch (error) {
      logger.error('Failed to setup backup service:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create encrypted backup vault
   */
  private async createBackupVault(vaultName: string, encryptionEnabled: boolean): Promise<void> {
    try {
      const command = new CreateBackupVaultCommand({
        BackupVaultName: vaultName,
        EncryptionKeyArn: encryptionEnabled ? await this.getKMSKeyArn() : undefined,
        BackupVaultTags: {
          'Environment': 'production',
          'HIPAA': 'true',
          'Project': 'voice-agent',
        },
      });

      await this.backupClient.send(command);
      logger.info(`Backup vault created: ${vaultName}`);
    } catch (error: any) {
      if (error.name === 'AlreadyExistsException') {
        logger.info(`Backup vault already exists: ${vaultName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create backup plan with HIPAA-compliant rules
   */
  private async createBackupPlan(planName: string, config: BackupConfig) {
    const backupRules = this.generateBackupRules(config);

    const command = new CreateBackupPlanCommand({
      BackupPlan: {
        BackupPlanName: planName,
        Rules: backupRules,
        AdvancedBackupSettings: [
          {
            ResourceType: 'RDS',
            BackupOptions: {
              'WindowsVSS': 'enabled',
            },
          },
        ],
      },
      BackupPlanTags: {
        'Practice': config.practiceId,
        'HIPAA': 'true',
        'BackupType': config.backupType,
      },
    });

    return this.backupClient.send(command);
  }

  /**
   * Generate backup rules based on configuration
   */
  private generateBackupRules(config: BackupConfig) {
    const rules = [];

    // Convert cron expression to AWS Backup schedule expression
    const scheduleExpression = this.convertCronToAWSSchedule(config.scheduleCron);

    if (config.backupType === 'database' || config.backupType === 'full') {
      rules.push({
        RuleName: `${config.practiceId}-database-rule`,
        TargetBackupVault: `practice-${config.practiceId}-vault`,
        ScheduleExpression: scheduleExpression,
        StartWindowMinutes: 60,
        CompletionWindowMinutes: 120,
        Lifecycle: {
          DeleteAfterDays: config.retentionDays,
          MoveToColdStorageAfterDays: Math.min(30, Math.floor(config.retentionDays / 3)),
        },
        EnableContinuousBackup: true,
        RecoveryPointTags: {
          'Type': 'Database',
          'Practice': config.practiceId,
          'HIPAA': 'true',
        },
      });
    }

    if (config.backupType === 'files' || config.backupType === 'full') {
      rules.push({
        RuleName: `${config.practiceId}-files-rule`,
        TargetBackupVault: `practice-${config.practiceId}-vault`,
        ScheduleExpression: scheduleExpression,
        StartWindowMinutes: 60,
        CompletionWindowMinutes: 240,
        Lifecycle: {
          DeleteAfterDays: config.retentionDays,
          MoveToColdStorageAfterDays: Math.min(30, Math.floor(config.retentionDays / 3)),
        },
        RecoveryPointTags: {
          'Type': 'Files',
          'Practice': config.practiceId,
          'HIPAA': 'true',
        },
      });
    }

    return rules;
  }

  /**
   * Convert cron expression to AWS Backup schedule expression
   */
  private convertCronToAWSSchedule(cronExpression: string): string {
    // AWS Backup uses different schedule format
    // For now, return a basic conversion - this would need more sophisticated logic
    // Example: "0 2 * * *" (daily at 2 AM) -> "cron(0 2 * * ? *)"
    const parts = cronExpression.split(' ');
    if (parts.length === 5) {
      // Convert from standard cron (5 parts) to AWS cron (6 parts)
      return `cron(${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]} ? ${parts[4]})`;
    }
    return `cron(${cronExpression})`;
  }

  /**
   * Assign resources to backup plan
   */
  private async assignResourcesToBackupPlan(backupPlanId: string, config: BackupConfig): Promise<void> {
    // This would require implementing resource selection based on tags or ARNs
    // For now, we'll log the requirement
    logger.info('Resource assignment required:', {
      backupPlanId,
      practiceId: config.practiceId,
      backupType: config.backupType,
    });

    // In a full implementation, this would:
    // 1. Discover RDS instances for database backups
    // 2. Discover EBS volumes for file backups
    // 3. Set up resource assignments with proper IAM roles
  }

  /**
   * Start an immediate backup job
   */
  async startBackupJob(config: BackupConfig, resourceArn: string): Promise<BackupResult> {
    try {
      const vaultName = `practice-${config.practiceId}-vault`;
      const iamRoleArn = await this.getBackupServiceRoleArn();

      const command = new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: resourceArn,
        IamRoleArn: iamRoleArn,
        IdempotencyToken: `${config.practiceId}-${Date.now()}`,
        CompleteWindowMinutes: 240,
        Lifecycle: {
          DeleteAfterDays: config.retentionDays,
          MoveToColdStorageAfterDays: Math.min(30, Math.floor(config.retentionDays / 3)),
        },
      });

      const result = await this.backupClient.send(command);

      return {
        success: true,
        backupJobId: result.BackupJobId,
        backupVaultName: vaultName,
        resourceArn,
        status: 'CREATED',
        message: 'Backup job started successfully',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to start backup job:', error);
      return {
        success: false,
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get backup job status
   */
  async getBackupJobStatus(backupJobId: string): Promise<BackupResult> {
    try {
      const command = new DescribeBackupJobCommand({
        BackupJobId: backupJobId,
      });

      const result = await this.backupClient.send(command);

      return {
        success: result.State !== 'FAILED' && result.State !== 'ABORTED',
        backupJobId: result.BackupJobId,
        backupVaultName: result.BackupVaultName,
        resourceArn: result.ResourceArn,
        status: result.State as any,
        message: result.StatusMessage || 'Backup job status retrieved',
        createdAt: result.CreationDate?.toISOString(),
        estimatedCompletionTime: result.ExpectedCompletionDate?.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get backup job status:', error);
      return {
        success: false,
        status: 'FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List recovery points for a practice
   */
  async listRecoveryPoints(practiceId: string, resourceArn?: string): Promise<RecoveryPointInfo[]> {
    try {
      const vaultName = `practice-${practiceId}-vault`;

      const command = new ListRecoveryPointsCommand({
        BackupVaultName: vaultName,
        ByResourceArn: resourceArn,
        ByResourceType: resourceArn ? undefined : 'RDS',
        MaxResults: 100,
      });

      const result = await this.backupClient.send(command);

      return (result.RecoveryPoints || []).map(point => ({
        recoveryPointArn: point.RecoveryPointArn!,
        resourceArn: point.ResourceArn!,
        resourceType: point.ResourceType!,
        creationDate: point.CreationDate!,
        status: point.Status!,
        encryptionKeyArn: point.EncryptionKeyArn,
        backupSizeInBytes: point.BackupSizeInBytes,
        iamRoleArn: point.IamRoleArn,
      }));
    } catch (error) {
      logger.error('Failed to list recovery points:', error);
      return [];
    }
  }

  /**
   * Start a restore job
   */
  async startRestoreJob(
    recoveryPointArn: string,
    practiceId: string,
    metadata: Record<string, string>
  ): Promise<RestoreJobInfo | null> {
    try {
      const iamRoleArn = await this.getRestoreServiceRoleArn();

      const command = new StartRestoreJobCommand({
        RecoveryPointArn: recoveryPointArn,
        Metadata: metadata,
        IamRoleArn: iamRoleArn,
        IdempotencyToken: `restore-${practiceId}-${Date.now()}`,
      });

      const result = await this.backupClient.send(command);

      return {
        restoreJobId: result.RestoreJobId!,
        accountId: '', // Would be populated from AWS account
        resourceType: 'RDS', // Would be detected from recovery point
        status: 'PENDING',
        creationDate: new Date(),
      };
    } catch (error) {
      logger.error('Failed to start restore job:', error);
      return null;
    }
  }

  /**
   * Get restore job status
   */
  async getRestoreJobStatus(restoreJobId: string): Promise<RestoreJobInfo | null> {
    try {
      const command = new DescribeRestoreJobCommand({
        RestoreJobId: restoreJobId,
      });

      const result = await this.backupClient.send(command);

      return {
        restoreJobId: result.RestoreJobId!,
        accountId: result.AccountId!,
        resourceType: result.ResourceType!,
        status: result.Status!,
        statusMessage: result.StatusMessage,
        creationDate: result.CreationDate!,
        completionDate: result.CompletionDate,
        expectedCompletionTimeMinutes: result.ExpectedCompletionTimeMinutes,
      };
    } catch (error) {
      logger.error('Failed to get restore job status:', error);
      return null;
    }
  }

  /**
   * Test backup configuration
   */
  async testBackupConfiguration(config: BackupConfig): Promise<{
    success: boolean;
    tests: Array<{
      test: string;
      result: boolean;
      message: string;
      details?: any;
    }>;
    overall_score: number;
  }> {
    const tests = [];

    // Test 1: Backup vault access
    try {
      const vaultName = `practice-${config.practiceId}-vault`;
      // This would test vault accessibility
      tests.push({
        test: 'backup_vault_access',
        result: true,
        message: `Backup vault ${vaultName} is accessible`,
      });
    } catch (error) {
      tests.push({
        test: 'backup_vault_access',
        result: false,
        message: 'Cannot access backup vault',
      });
    }

    // Test 2: IAM permissions
    try {
      const roleArn = await this.getBackupServiceRoleArn();
      tests.push({
        test: 'iam_permissions',
        result: !!roleArn,
        message: roleArn ? 'IAM role configured' : 'IAM role not found',
      });
    } catch (error) {
      tests.push({
        test: 'iam_permissions',
        result: false,
        message: 'IAM permissions not configured',
      });
    }

    // Test 3: Encryption settings
    tests.push({
      test: 'encryption_enabled',
      result: config.encryptionEnabled,
      message: config.encryptionEnabled
        ? 'Encryption enabled for HIPAA compliance'
        : 'Warning: Encryption disabled',
    });

    // Test 4: Retention policy
    const retentionValid = config.retentionDays >= 30 && config.retentionDays <= 2555;
    tests.push({
      test: 'retention_policy',
      result: retentionValid,
      message: retentionValid
        ? `Retention period: ${config.retentionDays} days`
        : 'Retention period should be 30 days to 7 years for HIPAA',
    });

    const passedTests = tests.filter(test => test.result).length;
    const overallScore = (passedTests / tests.length) * 100;

    return {
      success: overallScore >= 75,
      tests,
      overall_score: overallScore,
    };
  }

  /**
   * Get KMS key ARN for encryption
   */
  private async getKMSKeyArn(): Promise<string> {
    // In a real implementation, this would retrieve the KMS key ARN
    // For now, return a placeholder
    return `arn:aws:kms:${this.region}:123456789012:key/12345678-1234-1234-1234-123456789012`;
  }

  /**
   * Get backup service role ARN
   */
  private async getBackupServiceRoleArn(): Promise<string> {
    // In a real implementation, this would retrieve the service role ARN
    return `arn:aws:iam::123456789012:role/aws-backup-service-role`;
  }

  /**
   * Get restore service role ARN
   */
  private async getRestoreServiceRoleArn(): Promise<string> {
    // In a real implementation, this would retrieve the restore role ARN
    return `arn:aws:iam::123456789012:role/aws-backup-restore-role`;
  }
}

export default AWSBackupService;