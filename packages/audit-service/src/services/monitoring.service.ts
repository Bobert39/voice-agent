/**
 * Monitoring service for audit logging system
 * Provides dashboards, alerts, and health metrics for HIPAA compliance monitoring
 */

import { EventEmitter } from 'events';
import { AuditLogEntry, LogCategory, LogLevel, ActionStatus } from '../types/audit-log';

export interface MonitoringMetrics {
  logs: {
    total: number;
    byCategory: Record<LogCategory, number>;
    byLevel: Record<LogLevel, number>;
    byStatus: Record<ActionStatus, number>;
    hourlyRate: number;
    dailyRate: number;
  };
  performance: {
    avgProcessingTime: number;
    maxProcessingTime: number;
    successRate: number;
    errorRate: number;
  };
  security: {
    phiAccessEvents: number;
    authFailures: number;
    suspiciousActivities: number;
    complianceViolations: number;
  };
  storage: {
    hotStorageSize: number;
    warmStorageSize: number;
    coldStorageSize: number;
    totalRetained: number;
    retentionCompliance: number;
  };
  system: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
    networkLatency: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: 'THRESHOLD' | 'RATE' | 'ANOMALY' | 'COMPLIANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  conditions: {
    metric: string;
    operator: 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE';
    threshold: number;
    timeWindow: number; // seconds
  };
  actions: {
    email?: string[];
    slack?: string;
    webhook?: string;
    escalation?: boolean;
  };
  lastTriggered?: Date;
  triggerCount: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details: any;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  escalated: boolean;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'CHART' | 'METRIC' | 'TABLE' | 'ALERT_STATUS';
  config: {
    metric?: string;
    chartType?: 'line' | 'bar' | 'pie' | 'gauge';
    timeRange?: '1h' | '24h' | '7d' | '30d';
    refreshInterval?: number; // seconds
  };
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  permissions: {
    view: string[];
    edit: string[];
  };
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MonitoringService extends EventEmitter {
  private metrics: MonitoringMetrics;
  private alertRules: Map<string, AlertRule>;
  private activeAlerts: Map<string, Alert>;
  private dashboards: Map<string, Dashboard>;
  private metricsHistory: MonitoringMetrics[];
  private startTime: Date;

  constructor() {
    super();
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
    this.alertRules = new Map();
    this.activeAlerts = new Map();
    this.dashboards = new Map();
    this.metricsHistory = [];

    this.setupDefaultAlertRules();
    this.setupDefaultDashboards();
    this.startPeriodicMetricsCollection();
  }

  /**
   * Update metrics based on audit log entry
   */
  recordLogEntry(logEntry: AuditLogEntry, processingTime: number): void {
    // Update log metrics
    this.metrics.logs.total++;
    this.metrics.logs.byCategory[logEntry.category]++;
    this.metrics.logs.byLevel[logEntry.log_level]++;
    this.metrics.logs.byStatus[logEntry.action.status]++;

    // Update performance metrics
    this.updatePerformanceMetrics(processingTime, logEntry.action.status === ActionStatus.SUCCESS);

    // Update security metrics
    if (logEntry.phi_accessed) {
      this.metrics.security.phiAccessEvents++;
    }

    if (logEntry.action.status === ActionStatus.FAILURE) {
      if (logEntry.category === 'SECURITY') {
        this.metrics.security.authFailures++;
      }
    }

    // Check alert rules
    this.checkAlertRules();

    // Emit events for real-time monitoring
    this.emit('logProcessed', { logEntry, processingTime });
  }

  /**
   * Get current monitoring metrics
   */
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics history for time series analysis
   */
  getMetricsHistory(timeRange: '1h' | '24h' | '7d' | '30d'): MonitoringMetrics[] {
    const now = new Date();
    const cutoff = new Date();

    switch (timeRange) {
      case '1h':
        cutoff.setHours(now.getHours() - 1);
        break;
      case '24h':
        cutoff.setDate(now.getDate() - 1);
        break;
      case '7d':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoff.setDate(now.getDate() - 30);
        break;
    }

    return this.metricsHistory.filter(m => new Date(m.system.uptime) >= cutoff);
  }

  /**
   * Create or update alert rule
   */
  setAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.emit('alertRuleUpdated', rule);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolvedAt)
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolvedAt) {
      alert.resolvedAt = new Date();
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Create or update dashboard
   */
  setDashboard(dashboard: Dashboard): void {
    this.dashboards.set(dashboard.id, dashboard);
    this.emit('dashboardUpdated', dashboard);
  }

  /**
   * Get dashboard by ID
   */
  getDashboard(id: string): Dashboard | undefined {
    return this.dashboards.get(id);
  }

  /**
   * Get all dashboards
   */
  getDashboards(): Dashboard[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Get system health status
   */
  getHealthStatus(): {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    issues: string[];
    uptime: number;
    lastCheck: Date;
  } {
    const issues: string[] = [];
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

    // Check error rate
    if (this.metrics.performance.errorRate > 0.05) { // > 5%
      issues.push(`High error rate: ${(this.metrics.performance.errorRate * 100).toFixed(2)}%`);
      status = 'WARNING';
    }

    if (this.metrics.performance.errorRate > 0.10) { // > 10%
      status = 'CRITICAL';
    }

    // Check system resources
    if (this.metrics.system.memoryUsage > 0.8) { // > 80%
      issues.push(`High memory usage: ${(this.metrics.system.memoryUsage * 100).toFixed(1)}%`);
      if (status === 'HEALTHY') status = 'WARNING';
    }

    if (this.metrics.system.cpuUsage > 0.9) { // > 90%
      issues.push(`High CPU usage: ${(this.metrics.system.cpuUsage * 100).toFixed(1)}%`);
      status = 'CRITICAL';
    }

    // Check active critical alerts
    const criticalAlerts = this.getActiveAlerts().filter(a => a.severity === 'CRITICAL');
    if (criticalAlerts.length > 0) {
      issues.push(`${criticalAlerts.length} critical alerts active`);
      status = 'CRITICAL';
    }

    return {
      status,
      issues,
      uptime: Date.now() - this.startTime.getTime(),
      lastCheck: new Date()
    };
  }

  private initializeMetrics(): MonitoringMetrics {
    return {
      logs: {
        total: 0,
        byCategory: {
          [LogCategory.PATIENT_INTERACTION]: 0,
          [LogCategory.SYSTEM]: 0,
          [LogCategory.SECURITY]: 0,
          [LogCategory.COMPLIANCE]: 0
        },
        byLevel: {
          [LogLevel.DEBUG]: 0,
          [LogLevel.INFO]: 0,
          [LogLevel.WARN]: 0,
          [LogLevel.ERROR]: 0,
          [LogLevel.AUDIT]: 0
        },
        byStatus: {
          [ActionStatus.SUCCESS]: 0,
          [ActionStatus.FAILURE]: 0,
          [ActionStatus.PENDING]: 0
        },
        hourlyRate: 0,
        dailyRate: 0
      },
      performance: {
        avgProcessingTime: 0,
        maxProcessingTime: 0,
        successRate: 1.0,
        errorRate: 0.0
      },
      security: {
        phiAccessEvents: 0,
        authFailures: 0,
        suspiciousActivities: 0,
        complianceViolations: 0
      },
      storage: {
        hotStorageSize: 0,
        warmStorageSize: 0,
        coldStorageSize: 0,
        totalRetained: 0,
        retentionCompliance: 1.0
      },
      system: {
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        diskUsage: 0,
        networkLatency: 0
      }
    };
  }

  private updatePerformanceMetrics(processingTime: number, success: boolean): void {
    const perf = this.metrics.performance;

    // Update processing time metrics
    perf.maxProcessingTime = Math.max(perf.maxProcessingTime, processingTime);

    // Calculate rolling average (simplified)
    const totalLogs = this.metrics.logs.total;
    perf.avgProcessingTime = ((perf.avgProcessingTime * (totalLogs - 1)) + processingTime) / totalLogs;

    // Update success/error rates
    const successCount = this.metrics.logs.byStatus[ActionStatus.SUCCESS];
    const totalCount = totalLogs;

    perf.successRate = totalCount > 0 ? successCount / totalCount : 1.0;
    perf.errorRate = 1.0 - perf.successRate;
  }

  private setupDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds 5% over 15 minutes',
        type: 'THRESHOLD',
        severity: 'HIGH',
        enabled: true,
        conditions: {
          metric: 'performance.errorRate',
          operator: 'GT',
          threshold: 0.05,
          timeWindow: 900 // 15 minutes
        },
        actions: {
          email: ['admin@capitol-eye-care.com'],
          escalation: true
        },
        triggerCount: 0
      },
      {
        id: 'phi-access-spike',
        name: 'PHI Access Spike',
        description: 'Alert when PHI access events spike unusually',
        type: 'ANOMALY',
        severity: 'MEDIUM',
        enabled: true,
        conditions: {
          metric: 'security.phiAccessEvents',
          operator: 'GT',
          threshold: 100, // 100% increase from baseline
          timeWindow: 3600 // 1 hour
        },
        actions: {
          email: ['compliance@capitol-eye-care.com']
        },
        triggerCount: 0
      },
      {
        id: 'compliance-violation',
        name: 'HIPAA Compliance Violation',
        description: 'Critical alert for any compliance violation',
        type: 'THRESHOLD',
        severity: 'CRITICAL',
        enabled: true,
        conditions: {
          metric: 'security.complianceViolations',
          operator: 'GT',
          threshold: 0,
          timeWindow: 60 // 1 minute
        },
        actions: {
          email: ['admin@capitol-eye-care.com', 'compliance@capitol-eye-care.com'],
          escalation: true
        },
        triggerCount: 0
      }
    ];

    defaultRules.forEach(rule => this.setAlertRule(rule));
  }

  private setupDefaultDashboards(): void {
    const operationalDashboard: Dashboard = {
      id: 'operational-overview',
      name: 'Operational Overview',
      description: 'Real-time monitoring of audit logging operations',
      widgets: [
        {
          id: 'total-logs',
          title: 'Total Logs Today',
          type: 'METRIC',
          config: {
            metric: 'logs.total',
            timeRange: '24h'
          },
          position: { x: 0, y: 0, width: 3, height: 2 }
        },
        {
          id: 'error-rate',
          title: 'Error Rate',
          type: 'CHART',
          config: {
            metric: 'performance.errorRate',
            chartType: 'line',
            timeRange: '24h',
            refreshInterval: 60
          },
          position: { x: 3, y: 0, width: 6, height: 4 }
        },
        {
          id: 'phi-access',
          title: 'PHI Access Events',
          type: 'CHART',
          config: {
            metric: 'security.phiAccessEvents',
            chartType: 'bar',
            timeRange: '24h'
          },
          position: { x: 0, y: 2, width: 3, height: 4 }
        },
        {
          id: 'active-alerts',
          title: 'Active Alerts',
          type: 'ALERT_STATUS',
          config: {},
          position: { x: 9, y: 0, width: 3, height: 6 }
        }
      ],
      permissions: {
        view: ['admin', 'compliance_officer', 'audit_viewer'],
        edit: ['admin']
      },
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const complianceDashboard: Dashboard = {
      id: 'compliance-dashboard',
      name: 'HIPAA Compliance Dashboard',
      description: 'Monitoring HIPAA compliance metrics and violations',
      widgets: [
        {
          id: 'compliance-score',
          title: 'Compliance Score',
          type: 'METRIC',
          config: {
            metric: 'storage.retentionCompliance',
            chartType: 'gauge'
          },
          position: { x: 0, y: 0, width: 4, height: 4 }
        },
        {
          id: 'retention-status',
          title: 'Retention Policy Status',
          type: 'TABLE',
          config: {
            metric: 'storage',
            timeRange: '30d'
          },
          position: { x: 4, y: 0, width: 8, height: 4 }
        }
      ],
      permissions: {
        view: ['admin', 'compliance_officer', 'auditor'],
        edit: ['admin', 'compliance_officer']
      },
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.setDashboard(operationalDashboard);
    this.setDashboard(complianceDashboard);
  }

  private checkAlertRules(): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      const shouldTrigger = this.evaluateAlertRule(rule);

      if (shouldTrigger) {
        this.triggerAlert(rule);
      }
    }
  }

  private evaluateAlertRule(rule: AlertRule): boolean {
    // Simplified rule evaluation - in production, this would be more sophisticated
    const metricValue = this.getMetricValue(rule.conditions.metric);

    switch (rule.conditions.operator) {
      case 'GT':
        return metricValue > rule.conditions.threshold;
      case 'GTE':
        return metricValue >= rule.conditions.threshold;
      case 'LT':
        return metricValue < rule.conditions.threshold;
      case 'LTE':
        return metricValue <= rule.conditions.threshold;
      case 'EQ':
        return metricValue === rule.conditions.threshold;
      default:
        return false;
    }
  }

  private getMetricValue(metricPath: string): number {
    // Navigate the metrics object using dot notation
    const parts = metricPath.split('.');
    let value: any = this.metrics;

    for (const part of parts) {
      value = value?.[part];
    }

    return typeof value === 'number' ? value : 0;
  }

  private triggerAlert(rule: AlertRule): void {
    // Check if alert was recently triggered to avoid spam
    const cooldownPeriod = 300000; // 5 minutes
    if (rule.lastTriggered && Date.now() - rule.lastTriggered.getTime() < cooldownPeriod) {
      return;
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.description}`,
      details: {
        metric: rule.conditions.metric,
        value: this.getMetricValue(rule.conditions.metric),
        threshold: rule.conditions.threshold
      },
      triggeredAt: new Date(),
      acknowledged: false,
      escalated: false
    };

    this.activeAlerts.set(alert.id, alert);
    rule.lastTriggered = new Date();
    rule.triggerCount++;

    // Emit alert for notification handlers
    this.emit('alertTriggered', alert);

    // Handle escalation if configured
    if (rule.actions.escalation && rule.severity === 'CRITICAL') {
      setTimeout(() => {
        if (!alert.acknowledged) {
          alert.escalated = true;
          this.emit('alertEscalated', alert);
        }
      }, 900000); // 15 minutes
    }
  }

  private startPeriodicMetricsCollection(): void {
    // Collect system metrics every minute
    setInterval(() => {
      this.updateSystemMetrics();
      this.calculateRates();

      // Store metrics history (keep last 30 days)
      this.metricsHistory.push({ ...this.metrics });

      // Limit history to 43,200 entries (30 days * 24 hours * 60 minutes)
      if (this.metricsHistory.length > 43200) {
        this.metricsHistory = this.metricsHistory.slice(-43200);
      }

      this.emit('metricsUpdated', this.metrics);
    }, 60000); // 1 minute
  }

  private updateSystemMetrics(): void {
    // Mock system metrics - in production, use actual system monitoring
    this.metrics.system.uptime = Date.now() - this.startTime.getTime();
    this.metrics.system.memoryUsage = Math.random() * 0.6 + 0.2; // 20-80%
    this.metrics.system.cpuUsage = Math.random() * 0.4 + 0.1; // 10-50%
    this.metrics.system.diskUsage = Math.random() * 0.3 + 0.4; // 40-70%
    this.metrics.system.networkLatency = Math.random() * 50 + 10; // 10-60ms
  }

  private calculateRates(): void {
    // Calculate hourly and daily rates
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    // Simplified rate calculation - in production, use time-series data
    this.metrics.logs.hourlyRate = this.metrics.logs.total / 24; // Rough estimate
    this.metrics.logs.dailyRate = this.metrics.logs.total;
  }
}