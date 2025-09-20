import RecoveryService, { RecoveryProcedure, RecoveryTestResult } from '../../services/recoveryService';
import { ConfigurationService } from '../../services/configurationService';

// Mock dependencies
jest.mock('../../services/awsBackupService');
jest.mock('../../services/configurationService');

describe('RecoveryService', () => {
  let recoveryService: RecoveryService;
  let mockConfigService: jest.Mocked<ConfigurationService>;
  const mockPracticeId = 'practice-123';

  beforeEach(() => {
    recoveryService = new RecoveryService();
    mockConfigService = new ConfigurationService() as jest.Mocked<ConfigurationService>;
    (recoveryService as any).configService = mockConfigService;
    jest.clearAllMocks();
  });

  describe('getStandardRecoveryProcedures', () => {
    it('should return standard recovery procedures', () => {
      const procedures = recoveryService.getStandardRecoveryProcedures();

      expect(procedures).toHaveLength(3);

      // Check database recovery procedure
      const dbRecovery = procedures.find(p => p.id === 'database-full-restore');
      expect(dbRecovery).toBeDefined();
      expect(dbRecovery?.name).toBe('Complete Database Recovery');
      expect(dbRecovery?.riskLevel).toBe('CRITICAL');
      expect(dbRecovery?.hipaaCompliant).toBe(true);
      expect(dbRecovery?.steps.length).toBeGreaterThan(5);

      // Check partial data recovery procedure
      const partialRecovery = procedures.find(p => p.id === 'partial-data-recovery');
      expect(partialRecovery).toBeDefined();
      expect(partialRecovery?.riskLevel).toBe('MEDIUM');

      // Check file system recovery procedure
      const fileRecovery = procedures.find(p => p.id === 'file-system-recovery');
      expect(fileRecovery).toBeDefined();
      expect(fileRecovery?.estimatedTimeMinutes).toBe(45);
    });

    it('should include proper step validation for database recovery', () => {
      const procedures = recoveryService.getStandardRecoveryProcedures();
      const dbRecovery = procedures.find(p => p.id === 'database-full-restore');

      expect(dbRecovery?.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stepNumber: 1,
            title: 'Assess System State',
            checkpoints: expect.arrayContaining([
              'Database connectivity confirmed as failed',
              'No ongoing backup operations',
              'Recovery approval obtained from practice administrator',
            ]),
          }),
          expect.objectContaining({
            stepNumber: 4,
            title: 'Execute Database Restore',
            commands: expect.arrayContaining([
              expect.stringContaining('aws backup start-restore-job'),
            ]),
          }),
        ])
      );
    });
  });

  describe('createDisasterRecoveryPlan', () => {
    it('should create comprehensive disaster recovery plan', async () => {
      mockConfigService.createConfiguration.mockResolvedValue({
        success: true,
        message: 'Configuration created',
      });

      const plan = await recoveryService.createDisasterRecoveryPlan(mockPracticeId);

      expect(plan).toMatchObject({
        practiceId: mockPracticeId,
        planVersion: '1.0',
        rpoMinutes: 15, // 15 minutes maximum data loss
        rtoMinutes: 120, // 2 hours maximum downtime
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            scenarioId: 'database-full-restore',
            name: 'Complete Database Recovery',
          }),
        ]),
        contactList: expect.arrayContaining([
          expect.objectContaining({
            role: 'Primary Contact',
            isPrimary: true,
          }),
        ]),
        backupLocations: expect.arrayContaining([
          expect.objectContaining({
            type: 'PRIMARY',
            provider: 'AWS Backup',
            encryptionEnabled: true,
          }),
        ]),
      });

      expect(mockConfigService.createConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'disaster_recovery_plan',
          data: plan,
          requires_approval: false,
        }),
        'system',
        mockPracticeId,
        '127.0.0.1',
        'Recovery Service'
      );
    });
  });

  describe('executeRecovery', () => {
    it('should start recovery execution successfully', async () => {
      const procedureId = 'database-full-restore';
      const executorId = 'user-123';

      const result = await recoveryService.executeRecovery(
        mockPracticeId,
        procedureId,
        executorId
      );

      expect(result).toMatchObject({
        success: true,
        executionId: expect.stringMatching(/^recovery-/),
        currentStep: 1,
        status: 'RUNNING',
        message: 'Recovery procedure started successfully',
      });
    });

    it('should fail for unknown procedure', async () => {
      const procedureId = 'unknown-procedure';
      const executorId = 'user-123';

      const result = await recoveryService.executeRecovery(
        mockPracticeId,
        procedureId,
        executorId
      );

      expect(result).toMatchObject({
        success: false,
        currentStep: 0,
        status: 'FAILED',
        message: 'Recovery procedure not found',
      });
    });
  });

  describe('testRecoveryProcedure', () => {
    it('should test recovery procedure successfully', async () => {
      const procedureId = 'database-full-restore';

      mockConfigService.createConfiguration.mockResolvedValue({
        success: true,
        message: 'Test result saved',
      });

      const testResult = await recoveryService.testRecoveryProcedure(
        mockPracticeId,
        procedureId,
        true // dry run
      );

      expect(testResult).toMatchObject({
        testId: expect.stringMatching(/^test-/),
        testDate: expect.any(Date),
        success: true,
        timeToComplete: expect.any(Number),
        failedSteps: [],
        issues: [],
        recommendations: expect.any(Array),
      });

      expect(mockConfigService.createConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery_test_result',
          data: testResult,
        }),
        'system',
        mockPracticeId,
        '127.0.0.1',
        'Recovery Service'
      );
    });

    it('should handle test failures gracefully', async () => {
      const procedureId = 'invalid-procedure';

      await expect(
        recoveryService.testRecoveryProcedure(mockPracticeId, procedureId, true)
      ).rejects.toThrow('Recovery procedure not found');
    });

    it('should generate appropriate recommendations for successful tests', async () => {
      const procedureId = 'partial-data-recovery';

      mockConfigService.createConfiguration.mockResolvedValue({
        success: true,
        message: 'Test result saved',
      });

      const testResult = await recoveryService.testRecoveryProcedure(
        mockPracticeId,
        procedureId,
        true
      );

      expect(testResult.success).toBe(true);
      expect(testResult.failedSteps).toHaveLength(0);
      expect(testResult.issues).toHaveLength(0);
    });
  });

  describe('generateRunbook', () => {
    it('should generate comprehensive recovery runbook', async () => {
      const mockPlan = {
        practiceId: mockPracticeId,
        planVersion: '1.0',
        lastUpdated: new Date(),
        rpoMinutes: 15,
        rtoMinutes: 120,
        scenarios: [
          {
            name: 'Complete Database Recovery',
            triggerConditions: ['Database server unresponsive'],
            procedure: {
              estimatedTimeMinutes: 120,
              riskLevel: 'CRITICAL',
              steps: [
                {
                  stepNumber: 1,
                  title: 'Assess System State',
                  estimatedTimeMinutes: 10,
                  description: 'Evaluate current database state',
                  checkpoints: ['Database connectivity confirmed as failed'],
                  commands: [],
                },
              ],
            },
          },
        ],
        contactList: [
          {
            name: 'Practice Administrator',
            role: 'Primary Contact',
            phone: 'TBD',
            email: 'admin@practice.com',
          },
        ],
        backupLocations: [
          {
            type: 'PRIMARY',
            provider: 'AWS Backup',
            region: 'us-west-2',
            encryptionEnabled: true,
          },
        ],
      };

      // Mock the getDisasterRecoveryPlan method
      jest.spyOn(recoveryService as any, 'getDisasterRecoveryPlan').mockResolvedValue(mockPlan);

      const runbook = await recoveryService.generateRunbook(mockPracticeId);

      expect(runbook).toContain('# Disaster Recovery Runbook');
      expect(runbook).toContain(`**Practice ID:** ${mockPracticeId}`);
      expect(runbook).toContain('**RPO (Recovery Point Objective):** 15 minutes');
      expect(runbook).toContain('**RTO (Recovery Time Objective):** 120 minutes');
      expect(runbook).toContain('## Emergency Contacts');
      expect(runbook).toContain('Practice Administrator');
      expect(runbook).toContain('admin@practice.com');
      expect(runbook).toContain('## Recovery Procedures');
      expect(runbook).toContain('Complete Database Recovery');
      expect(runbook).toContain('Database server unresponsive');
      expect(runbook).toContain('## Backup Locations');
      expect(runbook).toContain('AWS Backup');
    });

    it('should handle missing disaster recovery plan', async () => {
      jest.spyOn(recoveryService as any, 'getDisasterRecoveryPlan').mockResolvedValue(null);

      await expect(
        recoveryService.generateRunbook(mockPracticeId)
      ).rejects.toThrow('Disaster recovery plan not found');
    });
  });

  describe('getTriggerConditions', () => {
    it('should return appropriate trigger conditions for database recovery', () => {
      const conditions = (recoveryService as any).getTriggerConditions('database-full-restore');

      expect(conditions).toEqual([
        'Database server unresponsive for > 5 minutes',
        'Data corruption detected',
        'Hardware failure confirmed',
        'Security breach requiring data restoration',
      ]);
    });

    it('should return appropriate trigger conditions for partial recovery', () => {
      const conditions = (recoveryService as any).getTriggerConditions('partial-data-recovery');

      expect(conditions).toEqual([
        'Specific table corruption detected',
        'Accidental data deletion',
        'Application bug causing data inconsistency',
      ]);
    });

    it('should return default conditions for unknown procedure', () => {
      const conditions = (recoveryService as any).getTriggerConditions('unknown-procedure');

      expect(conditions).toEqual(['Manual trigger by administrator']);
    });
  });

  describe('testRecoveryStep', () => {
    it('should validate recovery step checkpoints', async () => {
      const mockStep = {
        stepNumber: 1,
        title: 'Test Step',
        description: 'Test step description',
        checkpoints: ['Checkpoint 1', 'Checkpoint 2'],
        estimatedTimeMinutes: 10,
        commands: ['echo "test command"'],
      };

      // Should not throw error for valid step
      await expect(
        (recoveryService as any).testRecoveryStep(mockStep, true)
      ).resolves.not.toThrow();
    });

    it('should handle step testing in dry run mode', async () => {
      const mockStep = {
        stepNumber: 1,
        title: 'Test Step',
        description: 'Test step description',
        checkpoints: ['Checkpoint 1'],
        estimatedTimeMinutes: 5,
        commands: ['dangerous-command --delete-all'],
      };

      // In dry run mode, commands should not be executed
      await expect(
        (recoveryService as any).testRecoveryStep(mockStep, true)
      ).resolves.not.toThrow();
    });
  });
});