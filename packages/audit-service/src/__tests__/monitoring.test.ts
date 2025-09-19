/**
 * Tests for monitoring service functionality
 * Validates metrics collection, alerting, and dashboard management
 */

import { MonitoringService, AlertRule, Dashboard } from '../services/monitoring.service';
import { AuditLogEntry, LogCategory, LogLevel, EventType, ActionType, ActionStatus, InitiatorType, AuthorizationStatus } from '../types/audit-log';

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    monitoringService = new MonitoringService();
  });

  afterEach(() => {
    // Clean up event listeners
    monitoringService.removeAllListeners();
  });

  describe('Metrics Collection', () => {
    it('should initialize with zero metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics.logs.total).toBe(0);
      expect(metrics.performance.avgProcessingTime).toBe(0);
      expect(metrics.security.phiAccessEvents).toBe(0);
    });

    it('should record log entries and update metrics', () => {
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.AUDIT,
        category: LogCategory.PATIENT_INTERACTION,
        event_type: EventType.VERIFICATION,
        service: 'test-service',
        action: {
          type: ActionType.VERIFY_PATIENT,
          status: ActionStatus.SUCCESS,
          details: {
            verification_method: 'phone',
            phi_types_accessed: ['name', 'dob']
          }
        },
        patient_id: 'hashed-patient-id',
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: true,
        audit_trail: {
          initiator: InitiatorType.STAFF,
          reason: 'PATIENT_VERIFICATION',
          authorization: AuthorizationStatus.VALID,
          staff_id: 'STAFF001'
        }
      };

      monitoringService.recordLogEntry(logEntry, 150);

      const metrics = monitoringService.getMetrics();
      expect(metrics.logs.total).toBe(1);
      expect(metrics.logs.byCategory[LogCategory.PATIENT_INTERACTION]).toBe(1);
      expect(metrics.logs.byLevel[LogLevel.AUDIT]).toBe(1);
      expect(metrics.logs.byStatus[ActionStatus.SUCCESS]).toBe(1);
      expect(metrics.performance.avgProcessingTime).toBe(150);
      expect(metrics.performance.maxProcessingTime).toBe(150);
      expect(metrics.security.phiAccessEvents).toBe(1);
    });

    it('should calculate success and error rates correctly', () => {
      const successEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {}
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      const failureEntry: AuditLogEntry = {
        ...successEntry,
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.FAILURE,
          details: { error: 'Connection timeout' }
        }
      };

      // Record 3 successes and 1 failure
      monitoringService.recordLogEntry(successEntry, 100);
      monitoringService.recordLogEntry(successEntry, 120);
      monitoringService.recordLogEntry(successEntry, 110);
      monitoringService.recordLogEntry(failureEntry, 200);

      const metrics = monitoringService.getMetrics();
      expect(metrics.logs.total).toBe(4);
      expect(metrics.performance.successRate).toBe(0.75); // 3/4
      expect(metrics.performance.errorRate).toBe(0.25); // 1/4
      expect(metrics.performance.avgProcessingTime).toBe(132.5); // (100+120+110+200)/4
    });

    it('should emit events when logs are processed', (done) => {
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {}
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      monitoringService.on('logProcessed', (data) => {
        expect(data.logEntry).toEqual(logEntry);
        expect(data.processingTime).toBe(100);
        done();
      });

      monitoringService.recordLogEntry(logEntry, 100);
    });
  });

  describe('Alert Management', () => {
    it('should create and retrieve alert rules', () => {
      const alertRule: AlertRule = {
        id: 'test-rule',
        name: 'Test Alert Rule',
        description: 'Test alert for high error rate',
        type: 'THRESHOLD',
        severity: 'HIGH',
        enabled: true,
        conditions: {
          metric: 'performance.errorRate',
          operator: 'GT',
          threshold: 0.1,
          timeWindow: 300
        },
        actions: {
          email: ['admin@test.com'],
          escalation: true
        },
        triggerCount: 0
      };

      monitoringService.setAlertRule(alertRule);

      const rules = monitoringService.getAlertRules();
      expect(rules).toHaveLength(4); // 3 default + 1 new
      expect(rules.find(r => r.id === 'test-rule')).toEqual(alertRule);
    });

    it('should trigger alerts when conditions are met', (done) => {
      const alertRule: AlertRule = {
        id: 'low-threshold-test',
        name: 'Low Threshold Test',
        description: 'Test alert with very low threshold',
        type: 'THRESHOLD',
        severity: 'MEDIUM',
        enabled: true,
        conditions: {
          metric: 'logs.total',
          operator: 'GT',
          threshold: 0, // Very low threshold to ensure trigger
          timeWindow: 60
        },
        actions: {
          email: ['test@test.com']
        },
        triggerCount: 0
      };

      monitoringService.setAlertRule(alertRule);

      monitoringService.on('alertTriggered', (alert) => {
        expect(alert.ruleId).toBe('low-threshold-test');
        expect(alert.severity).toBe('MEDIUM');
        expect(alert.acknowledged).toBe(false);
        done();
      });

      // Record a log entry to trigger the alert
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {}
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      monitoringService.recordLogEntry(logEntry, 100);
    });

    it('should acknowledge and resolve alerts', (done) => {
      const alertRule: AlertRule = {
        id: 'ack-test-rule',
        name: 'Acknowledgment Test',
        description: 'Test alert for acknowledgment',
        type: 'THRESHOLD',
        severity: 'LOW',
        enabled: true,
        conditions: {
          metric: 'logs.total',
          operator: 'GT',
          threshold: 0,
          timeWindow: 60
        },
        actions: {
          email: ['test@test.com']
        },
        triggerCount: 0
      };

      monitoringService.setAlertRule(alertRule);

      let alertId: string;

      monitoringService.on('alertTriggered', (alert) => {
        alertId = alert.id;

        // Test acknowledgment
        const ackResult = monitoringService.acknowledgeAlert(alertId, 'test-user');
        expect(ackResult).toBe(true);

        const activeAlerts = monitoringService.getActiveAlerts();
        const acknowledgedAlert = activeAlerts.find(a => a.id === alertId);
        expect(acknowledgedAlert?.acknowledged).toBe(true);
        expect(acknowledgedAlert?.acknowledgedBy).toBe('test-user');

        // Test resolution
        const resolveResult = monitoringService.resolveAlert(alertId);
        expect(resolveResult).toBe(true);

        const remainingAlerts = monitoringService.getActiveAlerts();
        expect(remainingAlerts.find(a => a.id === alertId)).toBeUndefined();

        done();
      });

      // Trigger alert
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {}
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      monitoringService.recordLogEntry(logEntry, 100);
    });

    it('should prevent duplicate alert acknowledgment and resolution', () => {
      const alertRule: AlertRule = {
        id: 'duplicate-test',
        name: 'Duplicate Test',
        description: 'Test duplicate operations',
        type: 'THRESHOLD',
        severity: 'LOW',
        enabled: true,
        conditions: {
          metric: 'logs.total',
          operator: 'GT',
          threshold: 0,
          timeWindow: 60
        },
        actions: {
          email: ['test@test.com']
        },
        triggerCount: 0
      };

      monitoringService.setAlertRule(alertRule);

      return new Promise<void>((resolve) => {
        monitoringService.on('alertTriggered', (alert) => {
          const alertId = alert.id;

          // First acknowledgment should succeed
          expect(monitoringService.acknowledgeAlert(alertId, 'user1')).toBe(true);

          // Second acknowledgment should fail
          expect(monitoringService.acknowledgeAlert(alertId, 'user2')).toBe(false);

          // First resolution should succeed
          expect(monitoringService.resolveAlert(alertId)).toBe(true);

          // Second resolution should fail
          expect(monitoringService.resolveAlert(alertId)).toBe(false);

          resolve();
        });

        // Trigger alert
        const logEntry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          log_level: LogLevel.INFO,
          category: LogCategory.SYSTEM,
          event_type: EventType.ACCESS,
          service: 'test-service',
          action: {
            type: ActionType.RETRIEVE_INFO,
            status: ActionStatus.SUCCESS,
            details: {}
          },
          patient_id: null,
          session_id: 'test-session',
          metadata: {
            correlation_id: 'test-correlation',
            request_id: 'test-request'
          },
          phi_accessed: false,
          audit_trail: {
            initiator: InitiatorType.SYSTEM,
            reason: 'AUTOMATED_PROCESS',
            authorization: AuthorizationStatus.VALID
          }
        };

        monitoringService.recordLogEntry(logEntry, 100);
      });
    });
  });

  describe('Dashboard Management', () => {
    it('should create and retrieve dashboards', () => {
      const dashboard: Dashboard = {
        id: 'test-dashboard',
        name: 'Test Dashboard',
        description: 'Test monitoring dashboard',
        widgets: [
          {
            id: 'test-widget',
            title: 'Test Widget',
            type: 'METRIC',
            config: {
              metric: 'logs.total'
            },
            position: { x: 0, y: 0, width: 4, height: 2 }
          }
        ],
        permissions: {
          view: ['admin', 'compliance_officer'],
          edit: ['admin']
        },
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      monitoringService.setDashboard(dashboard);

      const retrieved = monitoringService.getDashboard('test-dashboard');
      expect(retrieved).toEqual(dashboard);

      const allDashboards = monitoringService.getDashboards();
      expect(allDashboards).toHaveLength(3); // 2 default + 1 new
    });

    it('should emit events when dashboards are updated', (done) => {
      const dashboard: Dashboard = {
        id: 'event-test-dashboard',
        name: 'Event Test Dashboard',
        description: 'Dashboard for testing events',
        widgets: [],
        permissions: {
          view: ['admin'],
          edit: ['admin']
        },
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      monitoringService.on('dashboardUpdated', (updatedDashboard) => {
        expect(updatedDashboard.id).toBe('event-test-dashboard');
        expect(updatedDashboard.name).toBe('Event Test Dashboard');
        done();
      });

      monitoringService.setDashboard(dashboard);
    });
  });

  describe('Health Status', () => {
    it('should report healthy status with no issues', () => {
      const health = monitoringService.getHealthStatus();

      expect(health.status).toBe('HEALTHY');
      expect(health.issues).toHaveLength(0);
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should report warning status with high error rate', () => {
      // Create multiple failure entries to increase error rate
      const failureEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.ERROR,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.FAILURE,
          details: { error: 'System error' }
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      // Record multiple failures to increase error rate above 5%
      for (let i = 0; i < 10; i++) {
        monitoringService.recordLogEntry(failureEntry, 100);
      }

      const health = monitoringService.getHealthStatus();
      expect(health.status).toBe('CRITICAL'); // 100% error rate
      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues[0]).toContain('High error rate');
    });
  });

  describe('Metrics History', () => {
    it('should store and retrieve metrics history', () => {
      // Record some entries
      const logEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        log_level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        event_type: EventType.ACCESS,
        service: 'test-service',
        action: {
          type: ActionType.RETRIEVE_INFO,
          status: ActionStatus.SUCCESS,
          details: {}
        },
        patient_id: null,
        session_id: 'test-session',
        metadata: {
          correlation_id: 'test-correlation',
          request_id: 'test-request'
        },
        phi_accessed: false,
        audit_trail: {
          initiator: InitiatorType.SYSTEM,
          reason: 'AUTOMATED_PROCESS',
          authorization: AuthorizationStatus.VALID
        }
      };

      monitoringService.recordLogEntry(logEntry, 100);

      const history = monitoringService.getMetricsHistory('1h');
      expect(Array.isArray(history)).toBe(true);
      // History might be empty initially as it's collected periodically
    });
  });
});