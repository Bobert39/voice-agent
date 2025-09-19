/**
 * Alert management and notification system
 * Based on Story 4.3 alerting requirements
 */

import axios from 'axios';
import { AlertRule, MetricValue } from '../types/metrics';
// import { isBusinessHours } from '../config/slo-config'; // for future use
import { businessMetrics } from '../metrics/prometheus-metrics';

export interface AlertInstance {
  id: string;
  rule: AlertRule;
  value: number;
  startedAt: Date;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  silenced: boolean;
}

export interface NotificationChannel {
  name: string;
  type: 'pagerduty' | 'slack' | 'email' | 'webhook';
  config: Record<string, any>;
  severities: Array<'critical' | 'warning' | 'info'>;
}

export class AlertManager {
  private activeAlerts: Map<string, AlertInstance> = new Map();
  private alertHistory: AlertInstance[] = [];
  private notificationChannels: NotificationChannel[] = [];

  constructor() {
    this.setupNotificationChannels();
  }

  /**
   * Setup notification channels based on environment configuration
   */
  private setupNotificationChannels(): void {
    // PagerDuty for critical alerts
    if (process.env.PAGERDUTY_CRITICAL_KEY) {
      this.notificationChannels.push({
        name: 'pagerduty-critical',
        type: 'pagerduty',
        config: {
          serviceKey: process.env.PAGERDUTY_CRITICAL_KEY,
          apiUrl: 'https://events.pagerduty.com/v2/enqueue'
        },
        severities: ['critical']
      });
    }

    if (process.env.PAGERDUTY_WARNING_KEY) {
      this.notificationChannels.push({
        name: 'pagerduty-warning',
        type: 'pagerduty',
        config: {
          serviceKey: process.env.PAGERDUTY_WARNING_KEY,
          apiUrl: 'https://events.pagerduty.com/v2/enqueue'
        },
        severities: ['warning']
      });
    }

    // Slack channels
    if (process.env.SLACK_WEBHOOK_URL) {
      this.notificationChannels.push({
        name: 'slack-alerts',
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: '#voice-agent-alerts'
        },
        severities: ['critical', 'warning']
      });

      this.notificationChannels.push({
        name: 'slack-monitoring',
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: '#voice-agent-monitoring'
        },
        severities: ['info']
      });
    }

    // Email notifications
    if (process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO) {
      this.notificationChannels.push({
        name: 'email-alerts',
        type: 'email',
        config: {
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT || 587,
          smtpUser: process.env.SMTP_USER,
          smtpPassword: process.env.SMTP_PASSWORD,
          from: process.env.ALERT_EMAIL_FROM || 'alerts@capitoleyecare.com',
          to: process.env.ALERT_EMAIL_TO
        },
        severities: ['critical', 'warning']
      });
    }
  }

  /**
   * Define alert rules based on Story 4.3 requirements
   */
  getAlertRules(): AlertRule[] {
    return [
      // Availability Alerts
      {
        name: 'ServiceDown',
        condition: 'up{job="voice-agent"} == 0',
        severity: 'critical',
        duration: '1m',
        labels: {
          team: 'oncall',
          priority: 'p0'
        },
        annotations: {
          summary: 'Voice Agent service is down',
          description: 'Voice Agent service has been down for more than 1 minute',
          runbook_url: 'https://wiki.capitoleyecare.com/runbooks/voice-agent-down'
        }
      },

      {
        name: 'HighErrorRate',
        condition: 'rate(api_errors_total[5m]) / rate(api_requests_total[5m]) > 0.01',
        severity: 'warning',
        duration: '5m',
        labels: {
          team: 'backend',
          priority: 'p1'
        },
        annotations: {
          summary: 'High error rate detected',
          description: 'API error rate is above 1% for the last 5 minutes',
          runbook_url: 'https://wiki.capitoleyecare.com/runbooks/high-error-rate'
        }
      },

      {
        name: 'CallCapacityWarning',
        condition: 'voice_active_calls / 50 > 0.8',
        severity: 'warning',
        duration: '5m',
        labels: {
          team: 'capacity',
          priority: 'p1'
        },
        annotations: {
          summary: 'High call volume detected',
          description: 'Call capacity is above 80% of maximum concurrent calls'
        }
      },

      // Performance Alerts
      {
        name: 'HighVoiceLatency',
        condition: 'histogram_quantile(0.95, voice_tts_latency_seconds) > 1',
        severity: 'warning',
        duration: '10m',
        labels: {
          team: 'performance',
          priority: 'p2'
        },
        annotations: {
          summary: 'Voice response latency is high',
          description: '95th percentile voice latency is above 1 second'
        }
      },

      {
        name: 'DatabaseConnectionPoolExhausted',
        condition: 'api_active_connections{service="database"} / 100 > 0.9',
        severity: 'critical',
        duration: '5m',
        labels: {
          team: 'database',
          priority: 'p0'
        },
        annotations: {
          summary: 'Database connection pool nearly exhausted',
          description: 'More than 90% of database connections are in use'
        }
      },

      // Business Metrics Alerts
      {
        name: 'LowVerificationSuccessRate',
        condition: 'rate(patient_verification_success_total[1h]) / rate(patient_verification_duration_seconds_count[1h]) < 0.8',
        severity: 'warning',
        duration: '15m',
        labels: {
          team: 'product',
          priority: 'p2'
        },
        annotations: {
          summary: 'Patient verification success rate is low',
          description: 'Patient verification success rate is below 80% for the last hour'
        }
      },

      {
        name: 'HighEscalationRate',
        condition: 'rate(escalations_total[1h]) / rate(voice_active_calls[1h]) > 0.15',
        severity: 'info',
        duration: '30m',
        labels: {
          team: 'operations',
          priority: 'p3'
        },
        annotations: {
          summary: 'High escalation rate detected',
          description: 'More than 15% of calls are being escalated to human staff'
        }
      },

      // Health Check Alerts
      {
        name: 'HealthCheckFailing',
        condition: 'health_check_status == 0',
        severity: 'critical',
        duration: '2m',
        labels: {
          team: 'oncall',
          priority: 'p0'
        },
        annotations: {
          summary: 'Critical health check failing',
          description: 'A critical service health check has been failing for 2 minutes'
        }
      },

      // AI Service Alerts
      {
        name: 'LowAIConfidence',
        condition: 'avg(ai_confidence_score) < 0.6',
        severity: 'warning',
        duration: '10m',
        labels: {
          team: 'ai',
          priority: 'p2'
        },
        annotations: {
          summary: 'AI confidence scores are low',
          description: 'Average AI confidence score has been below 60% for 10 minutes'
        }
      }
    ];
  }

  /**
   * Evaluate metric against alert rules
   */
  async evaluateMetric(
    metricName: string,
    value: MetricValue,
    rule: AlertRule
  ): Promise<boolean> {
    // Simple rule evaluation - in production this would use a proper expression evaluator
    const shouldAlert = this.evaluateCondition(rule.condition, metricName, value);

    if (shouldAlert) {
      const alertId = this.generateAlertId(rule, value.labels || {});

      if (!this.activeAlerts.has(alertId)) {
        await this.fireAlert(rule, value, alertId);
      }
    }

    return shouldAlert;
  }

  /**
   * Fire a new alert
   */
  private async fireAlert(
    rule: AlertRule,
    value: MetricValue,
    alertId: string
  ): Promise<void> {
    const alert: AlertInstance = {
      id: alertId,
      rule,
      value: value.value,
      startedAt: new Date(value.timestamp),
      labels: {
        ...rule.labels,
        ...(value.labels || {}),
        alertname: rule.name
      },
      annotations: rule.annotations,
      silenced: false
    };

    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);

    // Send notifications
    await this.sendNotifications(alert);

    // Record alert metric
    businessMetrics.escalationRate
      .labels('alert_fired', rule.severity)
      .inc();
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return;

    this.activeAlerts.delete(alertId);

    // Send resolution notification
    await this.sendResolutionNotification(alert);

    // Record resolution metric
    businessMetrics.appointmentsScheduled
      .labels('alert_resolved', alert.rule.severity, 'monitoring')
      .inc();
  }

  /**
   * Send notifications to appropriate channels
   */
  private async sendNotifications(alert: AlertInstance): Promise<void> {
    const channels = this.notificationChannels.filter(
      channel => channel.severities.includes(alert.rule.severity)
    );

    await Promise.allSettled(
      channels.map(channel => this.sendNotification(channel, alert))
    );
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(
    channel: NotificationChannel,
    alert: AlertInstance
  ): Promise<void> {
    try {
      switch (channel.type) {
        case 'pagerduty':
          await this.sendPagerDutyNotification(channel, alert);
          break;
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'email':
          await this.sendEmailNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
      }
    } catch (error) {
      console.error(`Failed to send notification via ${channel.name}:`, error);
    }
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(
    channel: NotificationChannel,
    alert: AlertInstance
  ): Promise<void> {
    const payload = {
      routing_key: channel.config.serviceKey,
      event_action: 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: alert.annotations.summary,
        source: 'Voice Agent Monitoring',
        severity: alert.rule.severity,
        component: alert.labels.service || 'voice-agent',
        group: alert.labels.team || 'oncall',
        class: 'monitoring',
        custom_details: {
          description: alert.annotations.description,
          runbook_url: alert.annotations.runbook_url,
          value: alert.value,
          labels: alert.labels,
          started_at: alert.startedAt.toISOString()
        }
      }
    };

    await axios.post(channel.config.apiUrl, payload, {
      timeout: 5000
    });
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    channel: NotificationChannel,
    alert: AlertInstance
  ): Promise<void> {
    const color = alert.rule.severity === 'critical' ? 'danger' :
                  alert.rule.severity === 'warning' ? 'warning' : 'good';

    const payload = {
      channel: channel.config.channel,
      username: 'Voice Agent Monitoring',
      icon_emoji: ':warning:',
      attachments: [
        {
          color,
          title: alert.annotations.summary,
          text: alert.annotations.description,
          fields: [
            {
              title: 'Severity',
              value: alert.rule.severity.toUpperCase(),
              short: true
            },
            {
              title: 'Value',
              value: alert.value.toString(),
              short: true
            },
            {
              title: 'Team',
              value: alert.labels.team || 'Unknown',
              short: true
            },
            {
              title: 'Started',
              value: alert.startedAt.toISOString(),
              short: true
            }
          ],
          actions: alert.annotations.runbook_url ? [
            {
              type: 'button',
              text: 'View Runbook',
              url: alert.annotations.runbook_url
            }
          ] : undefined
        }
      ]
    };

    await axios.post(channel.config.webhookUrl, payload, {
      timeout: 5000
    });
  }

  /**
   * Send email notification (placeholder - would integrate with SMTP)
   */
  private async sendEmailNotification(
    _channel: NotificationChannel,
    alert: AlertInstance
  ): Promise<void> {
    // Email implementation would go here
    console.log(`Email notification sent for alert: ${alert.annotations.summary}`);
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    channel: NotificationChannel,
    alert: AlertInstance
  ): Promise<void> {
    const payload = {
      alert_id: alert.id,
      alert_name: alert.rule.name,
      severity: alert.rule.severity,
      summary: alert.annotations.summary,
      description: alert.annotations.description,
      value: alert.value,
      labels: alert.labels,
      started_at: alert.startedAt.toISOString()
    };

    await axios.post(channel.config.webhookUrl, payload, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send resolution notification
   */
  private async sendResolutionNotification(alert: AlertInstance): Promise<void> {
    // Implementation for resolution notifications
    console.log(`Alert resolved: ${alert.annotations.summary}`);
  }

  /**
   * Simple condition evaluator (placeholder for proper expression engine)
   */
  private evaluateCondition(
    condition: string,
    metricName: string,
    value: MetricValue
  ): boolean {
    // This is a simplified evaluator - in production, use a proper expression engine
    if (condition.includes(metricName)) {
      if (condition.includes('> 0.01')) {
        return value.value > 0.01;
      }
      if (condition.includes('> 0.8')) {
        return value.value > 0.8;
      }
      if (condition.includes('> 1')) {
        return value.value > 1;
      }
      if (condition.includes('== 0')) {
        return value.value === 0;
      }
      if (condition.includes('< 0.8')) {
        return value.value < 0.8;
      }
      if (condition.includes('< 0.6')) {
        return value.value < 0.6;
      }
    }
    return false;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(rule: AlertRule, labels: Record<string, string>): string {
    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${rule.name}:${labelString}`;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): AlertInstance[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): AlertInstance[] {
    return this.alertHistory
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Silence an alert
   */
  silenceAlert(alertId: string, duration: number = 3600000): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.silenced = true;
      setTimeout(() => {
        if (this.activeAlerts.has(alertId)) {
          this.activeAlerts.get(alertId)!.silenced = false;
        }
      }, duration);
    }
  }

  /**
   * Get alerting statistics
   */
  getAlertingStats(): {
    active_alerts: number;
    alerts_by_severity: Record<string, number>;
    alerts_by_team: Record<string, number>;
    recent_alert_rate: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    const recentAlerts = this.alertHistory.filter(
      alert => Date.now() - alert.startedAt.getTime() < 24 * 60 * 60 * 1000
    );

    const alertsBySeverity: Record<string, number> = {};
    const alertsByTeam: Record<string, number> = {};

    for (const alert of activeAlerts) {
      alertsBySeverity[alert.rule.severity] = (alertsBySeverity[alert.rule.severity] || 0) + 1;
      const team = alert.labels.team || 'unknown';
      alertsByTeam[team] = (alertsByTeam[team] || 0) + 1;
    }

    return {
      active_alerts: activeAlerts.length,
      alerts_by_severity: alertsBySeverity,
      alerts_by_team: alertsByTeam,
      recent_alert_rate: recentAlerts.length / 24 // alerts per hour
    };
  }

  /**
   * Process incoming alert webhook
   */
  async processIncomingAlert(alertData: any): Promise<void> {
    try {
      // Process external alert data and create alert instance
      const alertRule: AlertRule = {
        name: alertData.alert_name || alertData.alertname || 'external-alert',
        condition: alertData.condition || 'external condition',
        severity: alertData.severity || 'warning',
        duration: alertData.duration || '1m',
        labels: alertData.labels || {},
        annotations: {
          summary: alertData.summary || 'External alert',
          description: alertData.description || 'Alert from external system'
        }
      };

      const metricValue: MetricValue = {
        value: alertData.value || 1,
        timestamp: Date.now(),
        labels: alertData.labels || {}
      };

      await this.evaluateMetric('external_metric', metricValue, alertRule);
    } catch (error) {
      console.error('Error processing incoming alert:', error);
    }
  }

  /**
   * Start alert manager (placeholder for initialization)
   */
  async start(): Promise<void> {
    console.log('Alert manager started');
    // Future: Start background alert evaluation loop
  }

  /**
   * Stop alert manager and cleanup
   */
  async stop(): Promise<void> {
    console.log('Alert manager stopped');
    // Future: Stop background processes and cleanup
  }
}