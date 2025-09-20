import { BackupMonitoringService } from '../../services/backupMonitoringService';
import AWS from 'aws-sdk';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockCloudWatch = {
    putMetricData: jest.fn(),
    putMetricAlarm: jest.fn(),
    describeAlarms: jest.fn(),
    getMetricStatistics: jest.fn(),
    getMetricData: jest.fn(),
  };

  const mockSNS = {
    publish: jest.fn(),
    createTopic: jest.fn(),
    subscribe: jest.fn(),
  };

  const mockBackup = {
    describeBackupJob: jest.fn(),
    listBackupJobs: jest.fn(),
    describeRecoveryPoint: jest.fn(),
    listRecoveryPointsByBackupVault: jest.fn(),
  };

  return {
    CloudWatch: jest.fn(() => mockCloudWatch),
    SNS: jest.fn(() => mockSNS),
    Backup: jest.fn(() => mockBackup),
  };
});

describe('BackupMonitoringService', () => {
  let service: BackupMonitoringService;
  let mockCloudWatch: any;
  let mockSNS: any;
  let mockBackup: any;

  beforeEach(() => {
    mockCloudWatch = new AWS.CloudWatch();
    mockSNS = new AWS.SNS();
    mockBackup = new AWS.Backup();

    service = new BackupMonitoringService();
    jest.clearAllMocks();
  });

  describe('initializeMonitoring', () => {
    it('should initialize monitoring successfully', async () => {
      mockCloudWatch.putMetricAlarm.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ ResponseMetadata: { RequestId: '123' } })
      });

      mockSNS.createTopic.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ TopicArn: 'arn:aws:sns:us-east-1:123456789012:backup-alerts' })
      });

      await service.initializeMonitoring();

      expect(mockCloudWatch.putMetricAlarm).toHaveBeenCalledTimes(4); // 4 different alarms
      expect(mockSNS.createTopic).toHaveBeenCalledWith({
        Name: 'backup-monitoring-alerts'
      });
    });

    it('should handle initialization errors', async () => {
      mockCloudWatch.putMetricAlarm.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Failed to create alarm'))
      });

      await expect(service.initializeMonitoring()).rejects.toThrow('Failed to create alarm');
    });
  });

  describe('recordBackupMetrics', () => {
    const mockBackupJob = {
      jobId: 'backup-123',
      status: 'COMPLETED',
      sizeBytes: 1024000,
      startTime: new Date('2024-01-15T10:00:00Z'),
      completionTime: new Date('2024-01-15T10:05:00Z'),
    };

    it('should record backup metrics successfully', async () => {
      mockCloudWatch.putMetricData.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      });

      await service.recordBackupMetrics(mockBackupJob);

      expect(mockCloudWatch.putMetricData).toHaveBeenCalledWith(
        expect.objectContaining({
          Namespace: 'ConfigurationBackup',
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'BackupSuccess',
              Value: 1
            }),
            expect.objectContaining({
              MetricName: 'BackupSize',
              Value: 1024000
            }),
            expect.objectContaining({
              MetricName: 'BackupDuration',
              Value: 300 // 5 minutes in seconds
            })
          ])
        })
      );
    });

    it('should record failed backup metrics', async () => {
      const failedBackup = {
        ...mockBackupJob,
        status: 'FAILED',
        errorMessage: 'Backup failed due to insufficient permissions'
      };

      mockCloudWatch.putMetricData.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      });

      await service.recordBackupMetrics(failedBackup);

      expect(mockCloudWatch.putMetricData).toHaveBeenCalledWith(
        expect.objectContaining({
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'BackupFailure',
              Value: 1
            })
          ])
        })
      );
    });

    it('should handle metric recording errors', async () => {
      mockCloudWatch.putMetricData.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('CloudWatch error'))
      });

      await expect(service.recordBackupMetrics(mockBackupJob)).rejects.toThrow('CloudWatch error');
    });
  });

  describe('checkBackupHealth', () => {
    it('should report healthy backup status', async () => {
      const mockBackupJobs = {
        BackupJobs: [
          { Status: 'COMPLETED', CompletionDate: new Date() },
          { Status: 'COMPLETED', CompletionDate: new Date() },
          { Status: 'COMPLETED', CompletionDate: new Date() },
        ]
      };

      mockBackup.listBackupJobs.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockBackupJobs)
      });

      const health = await service.checkBackupHealth();

      expect(health).toHaveProperty('status', 'healthy');
      expect(health).toHaveProperty('successRate', 100);
      expect(health.recentBackups).toHaveLength(3);
    });

    it('should report unhealthy backup status', async () => {
      const mockBackupJobs = {
        BackupJobs: [
          { Status: 'FAILED', CompletionDate: new Date() },
          { Status: 'FAILED', CompletionDate: new Date() },
          { Status: 'COMPLETED', CompletionDate: new Date() },
        ]
      };

      mockBackup.listBackupJobs.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockBackupJobs)
      });

      const health = await service.checkBackupHealth();

      expect(health).toHaveProperty('status', 'unhealthy');
      expect(health).toHaveProperty('successRate', 33.33);
      expect(health.issues).toContain('High failure rate detected');
    });

    it('should detect missing backups', async () => {
      mockBackup.listBackupJobs.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ BackupJobs: [] })
      });

      const health = await service.checkBackupHealth();

      expect(health).toHaveProperty('status', 'critical');
      expect(health.issues).toContain('No recent backups found');
    });
  });

  describe('getBackupMetrics', () => {
    it('should retrieve backup metrics', async () => {
      const mockMetrics = {
        MetricDataResults: [
          {
            Id: 'success_rate',
            Values: [95, 98, 100],
            Timestamps: [new Date('2024-01-15'), new Date('2024-01-14'), new Date('2024-01-13')]
          },
          {
            Id: 'backup_size',
            Values: [1024000, 1048576, 1073741824],
            Timestamps: [new Date('2024-01-15'), new Date('2024-01-14'), new Date('2024-01-13')]
          }
        ]
      };

      mockCloudWatch.getMetricData.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockMetrics)
      });

      const metrics = await service.getBackupMetrics('1d');

      expect(mockCloudWatch.getMetricData).toHaveBeenCalledWith(
        expect.objectContaining({
          MetricDataQueries: expect.arrayContaining([
            expect.objectContaining({
              Id: expect.any(String),
              MetricStat: expect.objectContaining({
                Metric: expect.objectContaining({
                  Namespace: 'ConfigurationBackup'
                })
              })
            })
          ])
        })
      );

      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('averageSize');
      expect(metrics).toHaveProperty('totalBackups');
    });

    it('should handle metric retrieval errors', async () => {
      mockCloudWatch.getMetricData.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Metrics unavailable'))
      });

      await expect(service.getBackupMetrics('1d')).rejects.toThrow('Metrics unavailable');
    });
  });

  describe('sendAlert', () => {
    it('should send critical alert', async () => {
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ MessageId: 'msg-123' })
      });

      await service.sendAlert('CRITICAL', 'Backup failure detected', {
        jobId: 'backup-123',
        error: 'Insufficient permissions'
      });

      expect(mockSNS.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          Subject: 'CRITICAL: Backup Alert',
          Message: expect.stringContaining('Backup failure detected'),
          MessageAttributes: expect.objectContaining({
            severity: expect.objectContaining({
              DataType: 'String',
              StringValue: 'CRITICAL'
            })
          })
        })
      );
    });

    it('should send warning alert', async () => {
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ MessageId: 'msg-124' })
      });

      await service.sendAlert('WARNING', 'Backup size exceeding threshold', {
        currentSize: 1073741824,
        threshold: 536870912
      });

      expect(mockSNS.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          Subject: 'WARNING: Backup Alert',
          Message: expect.stringContaining('Backup size exceeding threshold')
        })
      );
    });

    it('should handle alert sending failures', async () => {
      mockSNS.publish.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('SNS publish failed'))
      });

      await expect(
        service.sendAlert('CRITICAL', 'Test alert', {})
      ).rejects.toThrow('SNS publish failed');
    });
  });

  describe('getAlarmStatus', () => {
    it('should retrieve alarm status', async () => {
      const mockAlarms = {
        MetricAlarms: [
          {
            AlarmName: 'backup-failure-rate',
            StateValue: 'OK',
            StateReason: 'Threshold Crossed: 1 datapoint [0.0] was less than the threshold (10.0).'
          },
          {
            AlarmName: 'backup-size-threshold',
            StateValue: 'ALARM',
            StateReason: 'Threshold Crossed: 1 datapoint [2147483648.0] was greater than the threshold (1073741824.0).'
          }
        ]
      };

      mockCloudWatch.describeAlarms.mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockAlarms)
      });

      const alarmStatus = await service.getAlarmStatus();

      expect(mockCloudWatch.describeAlarms).toHaveBeenCalledWith(
        expect.objectContaining({
          AlarmNamePrefix: 'backup-'
        })
      );

      expect(alarmStatus).toHaveLength(2);
      expect(alarmStatus[0]).toHaveProperty('name', 'backup-failure-rate');
      expect(alarmStatus[0]).toHaveProperty('state', 'OK');
      expect(alarmStatus[1]).toHaveProperty('state', 'ALARM');
    });

    it('should handle alarm retrieval errors', async () => {
      mockCloudWatch.describeAlarms.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Failed to retrieve alarms'))
      });

      await expect(service.getAlarmStatus()).rejects.toThrow('Failed to retrieve alarms');
    });
  });

  describe('generateBackupReport', () => {
    it('should generate comprehensive backup report', async () => {
      // Mock all required data
      mockBackup.listBackupJobs.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          BackupJobs: [
            { Status: 'COMPLETED', BytesTransferred: 1024000, CompletionDate: new Date() },
            { Status: 'COMPLETED', BytesTransferred: 2048000, CompletionDate: new Date() },
          ]
        })
      });

      mockBackup.listRecoveryPointsByBackupVault.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          RecoveryPoints: [
            { RecoveryPointArn: 'arn:1', CreationDate: new Date(), BackupSizeInBytes: 1024000 },
            { RecoveryPointArn: 'arn:2', CreationDate: new Date(), BackupSizeInBytes: 2048000 },
          ]
        })
      });

      mockCloudWatch.getMetricStatistics.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Datapoints: [
            { Average: 95, Timestamp: new Date() },
            { Average: 98, Timestamp: new Date() },
          ]
        })
      });

      const report = await service.generateBackupReport('7d');

      expect(report).toHaveProperty('period', '7d');
      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('totalBackups', 2);
      expect(report.summary).toHaveProperty('successRate');
      expect(report.summary).toHaveProperty('totalSize', 3072000);
      expect(report).toHaveProperty('recommendations');
    });

    it('should provide recommendations in report', async () => {
      // Mock poor backup performance
      mockBackup.listBackupJobs.mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          BackupJobs: [
            { Status: 'FAILED', CompletionDate: new Date() },
            { Status: 'FAILED', CompletionDate: new Date() },
            { Status: 'COMPLETED', BytesTransferred: 5368709120, CompletionDate: new Date() }, // 5GB
          ]
        })
      });

      mockBackup.listRecoveryPointsByBackupVault.mockReturnValue({
        promise: jest.fn().mockResolvedValue({ RecoveryPoints: [] })
      });

      const report = await service.generateBackupReport('7d');

      expect(report.recommendations).toContain('Investigate frequent backup failures');
      expect(report.recommendations).toContain('Consider optimizing backup size');
    });
  });

  describe('configureAutoScaling', () => {
    it('should configure auto-scaling for backup resources', async () => {
      mockCloudWatch.putMetricAlarm.mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      });

      await service.configureAutoScaling({
        minBackupWindows: 1,
        maxBackupWindows: 4,
        targetUtilization: 70
      });

      expect(mockCloudWatch.putMetricAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          AlarmName: expect.stringContaining('backup-scaling'),
          ComparisonOperator: expect.any(String),
          Threshold: 70
        })
      );
    });
  });
});