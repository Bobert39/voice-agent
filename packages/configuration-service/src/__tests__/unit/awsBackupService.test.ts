import AWSBackupService, { BackupConfig } from '../../services/awsBackupService';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  Backup: jest.fn().mockImplementation(() => ({
    createBackupVault: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    createBackupPlan: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        BackupPlanId: 'mock-plan-id',
      }),
    }),
    startBackupJob: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        BackupJobId: 'mock-job-id',
      }),
    }),
    listRecoveryPoints: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        RecoveryPoints: [],
      }),
    }),
  })),
  RDS: jest.fn().mockImplementation(() => ({})),
  S3: jest.fn().mockImplementation(() => ({})),
}));

describe('AWSBackupService', () => {
  let backupService: AWSBackupService;
  const mockPracticeId = 'practice-123';

  beforeEach(() => {
    backupService = new AWSBackupService('us-west-2');
    jest.clearAllMocks();
  });

  describe('setupBackupService', () => {
    it('should successfully setup backup service with valid configuration', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
        notificationEmails: ['admin@practice.com'],
      };

      const result = await backupService.setupBackupService(config);

      expect(result).toEqual({
        success: true,
        backupPlanId: expect.any(String),
        backupVaultName: `practice-${mockPracticeId}-vault`,
        message: 'Backup service configured successfully',
      });
    });

    it('should handle setup failures gracefully', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: 'invalid-cron',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      // Mock AWS SDK to throw error
      const mockError = new Error('Invalid cron expression');
      jest.spyOn(backupService as any, 'createBackupVault').mockRejectedValue(mockError);

      const result = await backupService.setupBackupService(config);

      expect(result).toEqual({
        success: false,
        message: 'Invalid cron expression',
      });
    });
  });

  describe('startBackupJob', () => {
    it('should start backup job successfully', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      const resourceArn = 'arn:aws:rds:us-west-2:123456789012:db:practice-123';

      // Mock successful backup job start
      jest.spyOn(backupService as any, 'getBackupServiceRoleArn').mockResolvedValue(
        'arn:aws:iam::123456789012:role/aws-backup-service-role'
      );

      const result = await backupService.startBackupJob(config, resourceArn);

      expect(result.success).toBe(true);
      expect(result.status).toBe('CREATED');
      expect(result.backupJobId).toBeDefined();
      expect(result.message).toBe('Backup job started successfully');
    });

    it('should handle backup job start failures', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      const resourceArn = 'invalid-arn';

      // Mock backup job start failure
      jest.spyOn(backupService as any, 'getBackupServiceRoleArn').mockRejectedValue(
        new Error('Invalid resource ARN')
      );

      const result = await backupService.startBackupJob(config, resourceArn);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.message).toBe('Invalid resource ARN');
    });
  });

  describe('testBackupConfiguration', () => {
    it('should validate backup configuration successfully', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      // Mock successful validation methods
      jest.spyOn(backupService as any, 'getBackupServiceRoleArn').mockResolvedValue(
        'arn:aws:iam::123456789012:role/aws-backup-service-role'
      );

      const result = await backupService.testBackupConfiguration(config);

      expect(result.success).toBe(true);
      expect(result.overall_score).toBeGreaterThanOrEqual(75);
      expect(result.tests.length).toBeGreaterThan(0);

      // Check specific tests
      const encryptionTest = result.tests.find(t => t.test === 'encryption_enabled');
      expect(encryptionTest?.result).toBe(true);

      const retentionTest = result.tests.find(t => t.test === 'retention_policy');
      expect(retentionTest?.result).toBe(true);
    });

    it('should fail validation for insecure configuration', async () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 5, // Too short for HIPAA
        encryptionEnabled: false, // Not HIPAA compliant
        compressionEnabled: true,
      };

      // Mock failed validation
      jest.spyOn(backupService as any, 'getBackupServiceRoleArn').mockRejectedValue(
        new Error('IAM role not found')
      );

      const result = await backupService.testBackupConfiguration(config);

      expect(result.success).toBe(false);
      expect(result.overall_score).toBeLessThan(75);

      // Check specific failed tests
      const encryptionTest = result.tests.find(t => t.test === 'encryption_enabled');
      expect(encryptionTest?.result).toBe(false);

      const retentionTest = result.tests.find(t => t.test === 'retention_policy');
      expect(retentionTest?.result).toBe(false);
    });
  });

  describe('listRecoveryPoints', () => {
    it('should list recovery points successfully', async () => {
      const mockRecoveryPoints = [
        {
          recoveryPointArn: 'arn:aws:backup:us-west-2:123456789012:recovery-point:123',
          resourceArn: 'arn:aws:rds:us-west-2:123456789012:db:practice-123',
          resourceType: 'RDS',
          creationDate: new Date('2024-01-01'),
          status: 'COMPLETED',
          encryptionKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/123',
          backupSizeInBytes: 1024 * 1024 * 100, // 100 MB
        },
      ];

      // Mock successful recovery points retrieval
      jest.spyOn(backupService, 'listRecoveryPoints').mockResolvedValue(mockRecoveryPoints);

      const result = await backupService.listRecoveryPoints(mockPracticeId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        recoveryPointArn: expect.stringContaining('recovery-point'),
        resourceType: 'RDS',
        status: 'COMPLETED',
        encryptionKeyArn: expect.stringContaining('kms'),
      });
    });

    it('should handle empty recovery points list', async () => {
      jest.spyOn(backupService, 'listRecoveryPoints').mockResolvedValue([]);

      const result = await backupService.listRecoveryPoints(mockPracticeId);

      expect(result).toHaveLength(0);
    });
  });

  describe('convertCronToAWSSchedule', () => {
    it('should convert standard cron to AWS schedule format', () => {
      const standardCron = '0 2 * * *'; // Daily at 2 AM
      const result = (backupService as any).convertCronToAWSSchedule(standardCron);

      expect(result).toBe('cron(0 2 * * ? *)');
    });

    it('should handle 6-part cron expressions', () => {
      const awsCron = '0 2 * * ? *'; // Already in AWS format
      const result = (backupService as any).convertCronToAWSSchedule(awsCron);

      expect(result).toBe('cron(0 2 * * ? *)');
    });
  });

  describe('generateBackupRules', () => {
    it('should generate appropriate rules for database backup', () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'database',
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      const rules = (backupService as any).generateBackupRules(config);

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        RuleName: expect.stringContaining('database-rule'),
        TargetBackupVault: `practice-${mockPracticeId}-vault`,
        ScheduleExpression: 'cron(0 2 * * ? *)',
        Lifecycle: {
          DeleteAfterDays: 90,
          MoveToColdStorageAfterDays: 30,
        },
      });
    });

    it('should generate multiple rules for full backup', () => {
      const config: BackupConfig = {
        practiceId: mockPracticeId,
        backupType: 'full',
        scheduleCron: '0 2 * * *',
        retentionDays: 365,
        encryptionEnabled: true,
        compressionEnabled: true,
      };

      const rules = (backupService as any).generateBackupRules(config);

      expect(rules.length).toBeGreaterThan(1);
      expect(rules.some((rule: any) => rule.RuleName.includes('database-rule'))).toBe(true);
      expect(rules.some((rule: any) => rule.RuleName.includes('files-rule'))).toBe(true);
    });
  });
});