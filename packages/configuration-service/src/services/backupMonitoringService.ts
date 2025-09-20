import winston from 'winston';
import { AWSBackupService } from './awsBackupService';
import { ConfigurationService } from './configurationService';

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

export interface BackupMonitoringConfig {
  practiceId: string;
  monitoringEnabled: boolean;
  alertThresholds: AlertThresholds;
  notificationChannels: NotificationChannel[];
  checkIntervalMinutes: number;
  retentionDays: number;
}

export interface AlertThresholds {
  backupFailureCount: number;
  backupDelayMinutes: number;
  storageUsagePercent: number;
  restoreTimeMinutes: number;
  dataIntegrityScore: number;
}

export interface NotificationChannel {
  type: 'EMAIL' | 'SMS' | 'WEBHOOK' | 'SLACK';
  destination: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
}

export interface BackupAlert {
  id: string;
  practiceId: string;
  alertType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  details: Record<string, any>;
  createdAt: Date;
  resolvedAt?: Date;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';
  notificationsSent: NotificationStatus[];
}

export interface NotificationStatus {
  channel: string;
  sentAt: Date;
  success: boolean;
  error?: string;
}

export interface BackupHealthMetrics {
  practiceId: string;
  measuredAt: Date;
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
  metrics: {
    successfulBackups24h: number;
    failedBackups24h: number;
    averageBackupTime: number;
    lastSuccessfulBackup?: Date;
    storageUsedGB: number;
    storageQuotaGB: number;
    retentionCompliance: number;
    encryptionCompliance: number;
  };
  activeAlerts: number;
  recommendations: string[];
}

export interface BackupPerformanceReport {
  practiceId: string;
  reportPeriod: {
    startDate: Date;
    endDate: Date;
  };
  summary: {
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    averageBackupTime: number;
    dataBackedUpGB: number;
    storageEfficiency: number;
  };
  trends: {
    successRate: Array<{ date: Date; rate: number }>;
    performanceTrend: Array<{ date: Date; avgTimeMinutes: number }>;
    storageTrend: Array<{ date: Date; usageGB: number }>;
  };
  issues: Array<{
    type: string;
    count: number;
    description: string;
    recommendation: string;
  }>;
}

/**
 * Backup Monitoring and Alerting Service
 */
export class BackupMonitoringService {
  private awsBackupService: AWSBackupService;
  private configService: ConfigurationService;
  private activeMonitors: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.awsBackupService = new AWSBackupService();
    this.configService = new ConfigurationService();
  }

  /**
   * Setup monitoring for a practice
   */
  async setupMonitoring(config: BackupMonitoringConfig): Promise<{
    success: boolean;
    monitoringId: string;
    message: string;
  }> {
    try {
      const monitoringId = `monitor-${config.practiceId}`;

      // Save monitoring configuration
      await this.configService.createConfiguration(
        {
          type: 'backup_monitoring_config',
          data: config,
          requires_approval: false,
        },
        'system',
        config.practiceId,
        '127.0.0.1',
        'Backup Monitoring Service'
      );

      // Start monitoring if enabled
      if (config.monitoringEnabled) {
        await this.startMonitoring(config);
      }

      logger.info('Backup monitoring setup completed:', {
        monitoringId,
        practiceId: config.practiceId,
        enabled: config.monitoringEnabled,
      });

      return {
        success: true,
        monitoringId,
        message: 'Backup monitoring configured successfully',
      };
    } catch (error) {
      logger.error('Failed to setup backup monitoring:', error);
      return {
        success: false,
        monitoringId: '',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start monitoring for a practice
   */
  private async startMonitoring(config: BackupMonitoringConfig): Promise<void> {
    const practiceId = config.practiceId;

    // Stop existing monitoring if any
    if (this.activeMonitors.has(practiceId)) {
      clearInterval(this.activeMonitors.get(practiceId)!);
      this.activeMonitors.delete(practiceId);
    }

    // Start new monitoring interval
    const intervalMs = config.checkIntervalMinutes * 60 * 1000;
    const monitorInterval = setInterval(async () => {
      try {
        await this.performHealthCheck(config);
      } catch (error) {
        logger.error('Error during backup health check:', {
          practiceId,
          error,
        });
      }
    }, intervalMs);

    this.activeMonitors.set(practiceId, monitorInterval);

    logger.info('Backup monitoring started:', {
      practiceId,
      checkIntervalMinutes: config.checkIntervalMinutes,
    });
  }

  /**
   * Perform comprehensive backup health check
   */
  async performHealthCheck(config: BackupMonitoringConfig): Promise<BackupHealthMetrics> {
    const practiceId = config.practiceId;
    const measuredAt = new Date();

    logger.info('Performing backup health check:', { practiceId });

    try {
      // Collect backup metrics
      const metrics = await this.collectBackupMetrics(practiceId);

      // Check for alert conditions
      const alerts = await this.checkAlertConditions(config, metrics);

      // Process any new alerts
      for (const alert of alerts) {
        await this.processAlert(alert, config.notificationChannels);
      }

      // Determine overall health status
      const overallHealth = this.calculateOverallHealth(metrics, alerts.length);

      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(metrics, alerts);

      const healthMetrics: BackupHealthMetrics = {
        practiceId,
        measuredAt,
        overallHealth,
        metrics,
        activeAlerts: alerts.length,
        recommendations,
      };

      // Save health metrics
      await this.configService.createConfiguration(
        {
          type: 'backup_health_metrics',
          data: healthMetrics,
          requires_approval: false,
        },
        'system',
        practiceId,
        '127.0.0.1',
        'Backup Monitoring Service'
      );

      logger.info('Backup health check completed:', {
        practiceId,
        overallHealth,
        activeAlerts: alerts.length,
      });

      return healthMetrics;
    } catch (error) {
      logger.error('Backup health check failed:', { practiceId, error });

      const healthMetrics: BackupHealthMetrics = {
        practiceId,
        measuredAt,
        overallHealth: 'UNKNOWN',
        metrics: {
          successfulBackups24h: 0,
          failedBackups24h: 0,
          averageBackupTime: 0,
          storageUsedGB: 0,
          storageQuotaGB: 0,
          retentionCompliance: 0,
          encryptionCompliance: 0,
        },
        activeAlerts: 0,
        recommendations: ['Unable to collect backup metrics - check system connectivity'],
      };

      return healthMetrics;
    }
  }

  /**
   * Collect backup metrics for the last 24 hours
   */
  private async collectBackupMetrics(practiceId: string): Promise<BackupHealthMetrics['metrics']> {
    // Get recovery points from last 24 hours
    const recoveryPoints = await this.awsBackupService.listRecoveryPoints(practiceId);
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentPoints = recoveryPoints.filter(point => point.creationDate >= last24Hours);
    const successfulBackups = recentPoints.filter(point => point.status === 'COMPLETED').length;
    const failedBackups = recentPoints.filter(point => point.status === 'FAILED').length;

    // Calculate average backup time (simulated)
    const averageBackupTime = 15; // minutes (would be calculated from actual data)

    // Calculate storage usage (simulated)
    const totalSize = recentPoints.reduce((sum, point) => sum + (point.backupSizeInBytes || 0), 0);
    const storageUsedGB = totalSize / (1024 * 1024 * 1024);
    const storageQuotaGB = 1000; // Would be retrieved from AWS quota

    // Calculate compliance scores
    const encryptedBackups = recentPoints.filter(point => point.encryptionKeyArn).length;
    const encryptionCompliance = recentPoints.length > 0 ? (encryptedBackups / recentPoints.length) * 100 : 100;

    // Find last successful backup
    const lastSuccessfulBackup = recentPoints
      .filter(point => point.status === 'COMPLETED')
      .sort((a, b) => b.creationDate.getTime() - a.creationDate.getTime())[0]?.creationDate;

    return {
      successfulBackups24h: successfulBackups,
      failedBackups24h: failedBackups,
      averageBackupTime,
      lastSuccessfulBackup,
      storageUsedGB,
      storageQuotaGB,
      retentionCompliance: 100, // Would be calculated based on actual retention policy compliance
      encryptionCompliance,
    };
  }

  /**
   * Check for alert conditions
   */
  private async checkAlertConditions(
    config: BackupMonitoringConfig,
    metrics: BackupHealthMetrics['metrics']
  ): Promise<BackupAlert[]> {
    const alerts: BackupAlert[] = [];
    const thresholds = config.alertThresholds;

    // Check backup failure rate
    if (metrics.failedBackups24h >= thresholds.backupFailureCount) {
      alerts.push({
        id: `alert-${config.practiceId}-failures-${Date.now()}`,
        practiceId: config.practiceId,
        alertType: 'BACKUP_FAILURES',
        severity: 'HIGH',
        title: 'Multiple Backup Failures Detected',
        message: `${metrics.failedBackups24h} backup failures in the last 24 hours (threshold: ${thresholds.backupFailureCount})`,
        details: { failedBackups: metrics.failedBackups24h, threshold: thresholds.backupFailureCount },
        createdAt: new Date(),
        status: 'ACTIVE',
        notificationsSent: [],
      });
    }

    // Check backup delay
    if (metrics.lastSuccessfulBackup) {
      const hoursSinceLastBackup = (Date.now() - metrics.lastSuccessfulBackup.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastBackup * 60 > thresholds.backupDelayMinutes) {
        alerts.push({
          id: `alert-${config.practiceId}-delay-${Date.now()}`,
          practiceId: config.practiceId,
          alertType: 'BACKUP_DELAY',
          severity: 'MEDIUM',
          title: 'Backup Delay Detected',
          message: `Last successful backup was ${hoursSinceLastBackup.toFixed(1)} hours ago`,
          details: { lastBackup: metrics.lastSuccessfulBackup, delayHours: hoursSinceLastBackup },
          createdAt: new Date(),
          status: 'ACTIVE',
          notificationsSent: [],
        });
      }
    }

    // Check storage usage
    const storageUsagePercent = (metrics.storageUsedGB / metrics.storageQuotaGB) * 100;
    if (storageUsagePercent >= thresholds.storageUsagePercent) {
      alerts.push({
        id: `alert-${config.practiceId}-storage-${Date.now()}`,
        practiceId: config.practiceId,
        alertType: 'STORAGE_USAGE',
        severity: storageUsagePercent >= 90 ? 'CRITICAL' : 'HIGH',
        title: 'High Storage Usage',
        message: `Backup storage usage is ${storageUsagePercent.toFixed(1)}% (threshold: ${thresholds.storageUsagePercent}%)`,
        details: { usagePercent: storageUsagePercent, usedGB: metrics.storageUsedGB, quotaGB: metrics.storageQuotaGB },
        createdAt: new Date(),
        status: 'ACTIVE',
        notificationsSent: [],
      });
    }

    // Check encryption compliance
    if (metrics.encryptionCompliance < 100) {
      alerts.push({
        id: `alert-${config.practiceId}-encryption-${Date.now()}`,
        practiceId: config.practiceId,
        alertType: 'ENCRYPTION_COMPLIANCE',
        severity: 'CRITICAL',
        title: 'Encryption Compliance Issue',
        message: `Only ${metrics.encryptionCompliance.toFixed(1)}% of backups are encrypted (HIPAA requirement: 100%)`,
        details: { encryptionCompliance: metrics.encryptionCompliance },
        createdAt: new Date(),
        status: 'ACTIVE',
        notificationsSent: [],
      });
    }

    return alerts;
  }

  /**
   * Process and send alert notifications
   */
  private async processAlert(alert: BackupAlert, channels: NotificationChannel[]): Promise<void> {
    logger.info('Processing backup alert:', {
      alertId: alert.id,
      type: alert.alertType,
      severity: alert.severity,
    });

    // Save alert to configuration
    await this.configService.createConfiguration(
      {
        type: 'backup_alert',
        data: alert,
        requires_approval: false,
      },
      'system',
      alert.practiceId,
      '127.0.0.1',
      'Backup Monitoring Service'
    );

    // Send notifications based on severity
    const applicableChannels = channels.filter(channel =>
      channel.enabled && this.shouldNotify(channel.severity, alert.severity)
    );

    for (const channel of applicableChannels) {
      try {
        const success = await this.sendNotification(channel, alert);
        alert.notificationsSent.push({
          channel: `${channel.type}:${channel.destination}`,
          sentAt: new Date(),
          success,
        });
      } catch (error) {
        alert.notificationsSent.push({
          channel: `${channel.type}:${channel.destination}`,
          sentAt: new Date(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Send notification through specified channel
   */
  private async sendNotification(channel: NotificationChannel, alert: BackupAlert): Promise<boolean> {
    logger.info('Sending notification:', {
      type: channel.type,
      destination: channel.destination,
      alertType: alert.alertType,
    });

    switch (channel.type) {
      case 'EMAIL':
        return this.sendEmailNotification(channel.destination, alert);
      case 'SMS':
        return this.sendSMSNotification(channel.destination, alert);
      case 'WEBHOOK':
        return this.sendWebhookNotification(channel.destination, alert);
      case 'SLACK':
        return this.sendSlackNotification(channel.destination, alert);
      default:
        logger.warn('Unknown notification channel type:', channel.type);
        return false;
    }
  }

  /**
   * Send email notification (implementation placeholder)
   */
  private async sendEmailNotification(destination: string, alert: BackupAlert): Promise<boolean> {
    // In a real implementation, this would integrate with AWS SES or similar
    logger.info('Email notification sent (simulated):', {
      to: destination,
      subject: `Backup Alert: ${alert.title}`,
      alertId: alert.id,
    });
    return true;
  }

  /**
   * Send SMS notification (implementation placeholder)
   */
  private async sendSMSNotification(destination: string, alert: BackupAlert): Promise<boolean> {
    // In a real implementation, this would integrate with AWS SNS or Twilio
    logger.info('SMS notification sent (simulated):', {
      to: destination,
      message: `${alert.title}: ${alert.message}`,
      alertId: alert.id,
    });
    return true;
  }

  /**
   * Send webhook notification (implementation placeholder)
   */
  private async sendWebhookNotification(destination: string, alert: BackupAlert): Promise<boolean> {
    // In a real implementation, this would make HTTP POST request
    logger.info('Webhook notification sent (simulated):', {
      url: destination,
      alertId: alert.id,
    });
    return true;
  }

  /**
   * Send Slack notification (implementation placeholder)
   */
  private async sendSlackNotification(destination: string, alert: BackupAlert): Promise<boolean> {
    // In a real implementation, this would use Slack Web API
    logger.info('Slack notification sent (simulated):', {
      channel: destination,
      message: `🚨 *${alert.title}*\n${alert.message}`,
      alertId: alert.id,
    });
    return true;
  }

  /**
   * Determine if notification should be sent based on severity
   */
  private shouldNotify(channelSeverity: string, alertSeverity: string): boolean {
    const severityLevels = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    return severityLevels[alertSeverity as keyof typeof severityLevels] >=
           severityLevels[channelSeverity as keyof typeof severityLevels];
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallHealth(
    metrics: BackupHealthMetrics['metrics'],
    alertCount: number
  ): 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' {
    if (alertCount === 0 && metrics.successfulBackups24h > 0 && metrics.failedBackups24h === 0) {
      return 'HEALTHY';
    }

    if (alertCount > 0 && metrics.failedBackups24h === 0) {
      return 'WARNING';
    }

    if (metrics.failedBackups24h > 0 || alertCount > 2) {
      return 'CRITICAL';
    }

    return 'WARNING';
  }

  /**
   * Generate health recommendations
   */
  private generateHealthRecommendations(
    metrics: BackupHealthMetrics['metrics'],
    alerts: BackupAlert[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.failedBackups24h > 0) {
      recommendations.push('Investigate and resolve backup failures immediately');
    }

    if (metrics.encryptionCompliance < 100) {
      recommendations.push('Enable encryption for all backups to maintain HIPAA compliance');
    }

    if ((metrics.storageUsedGB / metrics.storageQuotaGB) > 0.8) {
      recommendations.push('Consider increasing storage quota or implementing retention policies');
    }

    if (alerts.length === 0 && metrics.successfulBackups24h > 0) {
      recommendations.push('Backup system is performing well - maintain current procedures');
    }

    return recommendations;
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(
    practiceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BackupPerformanceReport> {
    logger.info('Generating backup performance report:', {
      practiceId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    // Get all recovery points in the date range
    const recoveryPoints = await this.awsBackupService.listRecoveryPoints(practiceId);
    const periodPoints = recoveryPoints.filter(point =>
      point.creationDate >= startDate && point.creationDate <= endDate
    );

    const successfulBackups = periodPoints.filter(point => point.status === 'COMPLETED').length;
    const failedBackups = periodPoints.filter(point => point.status === 'FAILED').length;
    const totalBackups = periodPoints.length;

    const dataBackedUpGB = periodPoints.reduce(
      (sum, point) => sum + (point.backupSizeInBytes || 0), 0
    ) / (1024 * 1024 * 1024);

    // Generate daily trends (simplified)
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const successRate = [];
    const performanceTrend = [];
    const storageTrend = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      successRate.push({ date, rate: Math.random() * 20 + 80 }); // Simulated
      performanceTrend.push({ date, avgTimeMinutes: Math.random() * 10 + 15 }); // Simulated
      storageTrend.push({ date, usageGB: Math.random() * 100 + 500 }); // Simulated
    }

    const report: BackupPerformanceReport = {
      practiceId,
      reportPeriod: { startDate, endDate },
      summary: {
        totalBackups,
        successfulBackups,
        failedBackups,
        averageBackupTime: 15, // Simulated
        dataBackedUpGB,
        storageEfficiency: 85, // Simulated compression ratio
      },
      trends: {
        successRate,
        performanceTrend,
        storageTrend,
      },
      issues: [], // Would be populated with actual issues found
    };

    // Save report
    await this.configService.createConfiguration(
      {
        type: 'backup_performance_report',
        data: report,
        requires_approval: false,
      },
      'system',
      practiceId,
      '127.0.0.1',
      'Backup Monitoring Service'
    );

    return report;
  }

  /**
   * Stop monitoring for a practice
   */
  async stopMonitoring(practiceId: string): Promise<void> {
    if (this.activeMonitors.has(practiceId)) {
      clearInterval(this.activeMonitors.get(practiceId)!);
      this.activeMonitors.delete(practiceId);

      logger.info('Backup monitoring stopped:', { practiceId });
    }
  }
}

export default BackupMonitoringService;