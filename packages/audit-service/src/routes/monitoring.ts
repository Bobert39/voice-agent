/**
 * Monitoring and dashboard API routes
 * Provides endpoints for audit system monitoring, alerts, and dashboards
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { MonitoringService, AlertRule, Dashboard, DashboardWidget } from '../services/monitoring.service';
import {
  authenticateToken,
  requirePermission,
  requireRole,
  AuditRole,
  AuditPermission
} from '../middleware/rbac';

// Temporary implementation until shared-utils is available
const createLogger = (service: string) => ({
  info: (message: string, meta?: any) => console.log(`[${service}] INFO:`, message, meta || ''),
  warn: (message: string, meta?: any) => console.log(`[${service}] WARN:`, message, meta || ''),
  error: (message: string, meta?: any) => console.log(`[${service}] ERROR:`, message, meta || '')
});

const logger = createLogger('monitoring-routes');
const router = Router();

// Initialize monitoring service
const monitoringService = new MonitoringService();

// Validation schemas
const alertRuleSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  type: Joi.string().valid('THRESHOLD', 'RATE', 'ANOMALY', 'COMPLIANCE').required(),
  severity: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').required(),
  enabled: Joi.boolean().required(),
  conditions: Joi.object({
    metric: Joi.string().required(),
    operator: Joi.string().valid('GT', 'LT', 'EQ', 'GTE', 'LTE').required(),
    threshold: Joi.number().required(),
    timeWindow: Joi.number().integer().min(60).required()
  }).required(),
  actions: Joi.object({
    email: Joi.array().items(Joi.string().email()).optional(),
    slack: Joi.string().uri().optional(),
    webhook: Joi.string().uri().optional(),
    escalation: Joi.boolean().optional()
  }).required()
});

const dashboardSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  widgets: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    title: Joi.string().required(),
    type: Joi.string().valid('CHART', 'METRIC', 'TABLE', 'ALERT_STATUS').required(),
    config: Joi.object().required(),
    position: Joi.object({
      x: Joi.number().integer().min(0).required(),
      y: Joi.number().integer().min(0).required(),
      width: Joi.number().integer().min(1).required(),
      height: Joi.number().integer().min(1).required()
    }).required()
  })).required(),
  permissions: Joi.object({
    view: Joi.array().items(Joi.string()).required(),
    edit: Joi.array().items(Joi.string()).required()
  }).required()
});

/**
 * GET /monitoring/health
 * Get system health status
 * Requires: Basic authentication
 */
router.get('/health',
  authenticateToken,
  async (req: Request, res: Response) => {
  try {
    const healthStatus = monitoringService.getHealthStatus();

    res.json({
      success: true,
      data: healthStatus
    });

  } catch (error) {
    logger.error('Failed to get health status', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get health status'
    });
  }
});

/**
 * GET /monitoring/metrics
 * Get current monitoring metrics
 * Requires: Audit viewer permissions
 */
router.get('/metrics',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as '1h' | '24h' | '7d' | '30d' || '24h';
    const current = req.query.current === 'true';

    if (current) {
      const metrics = monitoringService.getMetrics();
      res.json({
        success: true,
        data: metrics
      });
    } else {
      const metricsHistory = monitoringService.getMetricsHistory(timeRange);
      res.json({
        success: true,
        data: metricsHistory,
        timeRange,
        count: metricsHistory.length
      });
    }

  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get metrics'
    });
  }
});

/**
 * GET /monitoring/alerts
 * Get active alerts
 * Requires: Audit viewer permissions
 */
router.get('/alerts',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    const activeAlerts = monitoringService.getActiveAlerts();

    res.json({
      success: true,
      data: activeAlerts,
      count: activeAlerts.length
    });

  } catch (error) {
    logger.error('Failed to get alerts', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get alerts'
    });
  }
});

/**
 * PUT /monitoring/alerts/:alertId/acknowledge
 * Acknowledge an alert
 * Requires: Audit viewer permissions
 */
router.put('/alerts/:alertId/acknowledge',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const user = (req as any).user;

    const acknowledged = monitoringService.acknowledgeAlert(alertId, user.id);

    if (acknowledged) {
      logger.info('Alert acknowledged', { alertId, acknowledgedBy: user.id });
      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });
    } else {
      res.status(404).json({
        error: 'Not found',
        message: 'Alert not found or already acknowledged'
      });
    }

  } catch (error) {
    logger.error('Failed to acknowledge alert', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to acknowledge alert'
    });
  }
});

/**
 * PUT /monitoring/alerts/:alertId/resolve
 * Resolve an alert
 * Requires: Admin or compliance officer role
 */
router.put('/alerts/:alertId/resolve',
  authenticateToken,
  requireRole(AuditRole.ADMIN, AuditRole.COMPLIANCE_OFFICER),
  async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const user = (req as any).user;

    const resolved = monitoringService.resolveAlert(alertId);

    if (resolved) {
      logger.info('Alert resolved', { alertId, resolvedBy: user.id });
      res.json({
        success: true,
        message: 'Alert resolved successfully'
      });
    } else {
      res.status(404).json({
        error: 'Not found',
        message: 'Alert not found or already resolved'
      });
    }

  } catch (error) {
    logger.error('Failed to resolve alert', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to resolve alert'
    });
  }
});

/**
 * GET /monitoring/alert-rules
 * Get all alert rules
 * Requires: Admin or compliance officer role
 */
router.get('/alert-rules',
  authenticateToken,
  requireRole(AuditRole.ADMIN, AuditRole.COMPLIANCE_OFFICER),
  async (req: Request, res: Response) => {
  try {
    const alertRules = monitoringService.getAlertRules();

    res.json({
      success: true,
      data: alertRules,
      count: alertRules.length
    });

  } catch (error) {
    logger.error('Failed to get alert rules', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get alert rules'
    });
  }
});

/**
 * POST /monitoring/alert-rules
 * Create or update alert rule
 * Requires: Admin role
 */
router.post('/alert-rules',
  authenticateToken,
  requireRole(AuditRole.ADMIN),
  async (req: Request, res: Response) => {
  try {
    const { error, value } = alertRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const user = (req as any).user;
    const alertRule: AlertRule = {
      ...value,
      triggerCount: 0
    };

    monitoringService.setAlertRule(alertRule);

    logger.info('Alert rule created/updated', {
      ruleId: alertRule.id,
      createdBy: user.id
    });

    res.status(201).json({
      success: true,
      message: 'Alert rule created/updated successfully',
      data: alertRule
    });

  } catch (error) {
    logger.error('Failed to create/update alert rule', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create/update alert rule'
    });
  }
});

/**
 * GET /monitoring/dashboards
 * Get all dashboards
 * Requires: Audit viewer permissions
 */
router.get('/dashboards',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const allDashboards = monitoringService.getDashboards();

    // Filter dashboards based on user permissions
    const accessibleDashboards = allDashboards.filter(dashboard =>
      dashboard.permissions.view.includes(user.role) ||
      dashboard.permissions.view.includes('all')
    );

    res.json({
      success: true,
      data: accessibleDashboards,
      count: accessibleDashboards.length
    });

  } catch (error) {
    logger.error('Failed to get dashboards', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get dashboards'
    });
  }
});

/**
 * GET /monitoring/dashboards/:dashboardId
 * Get specific dashboard
 * Requires: Audit viewer permissions
 */
router.get('/dashboards/:dashboardId',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    const { dashboardId } = req.params;
    const user = (req as any).user;
    const dashboard = monitoringService.getDashboard(dashboardId);

    if (!dashboard) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Dashboard not found'
      });
    }

    // Check user permissions
    const hasAccess = dashboard.permissions.view.includes(user.role) ||
                     dashboard.permissions.view.includes('all');

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions to view this dashboard'
      });
    }

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    logger.error('Failed to get dashboard', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get dashboard'
    });
  }
});

/**
 * POST /monitoring/dashboards
 * Create new dashboard
 * Requires: Admin or compliance officer role
 */
router.post('/dashboards',
  authenticateToken,
  requireRole(AuditRole.ADMIN, AuditRole.COMPLIANCE_OFFICER),
  async (req: Request, res: Response) => {
  try {
    const { error, value } = dashboardSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const user = (req as any).user;
    const dashboard: Dashboard = {
      ...value,
      createdBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    monitoringService.setDashboard(dashboard);

    logger.info('Dashboard created', {
      dashboardId: dashboard.id,
      createdBy: user.id
    });

    res.status(201).json({
      success: true,
      message: 'Dashboard created successfully',
      data: dashboard
    });

  } catch (error) {
    logger.error('Failed to create dashboard', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create dashboard'
    });
  }
});

/**
 * PUT /monitoring/dashboards/:dashboardId
 * Update existing dashboard
 * Requires: Admin role or dashboard edit permissions
 */
router.put('/dashboards/:dashboardId',
  authenticateToken,
  async (req: Request, res: Response) => {
  try {
    const { dashboardId } = req.params;
    const user = (req as any).user;
    const existingDashboard = monitoringService.getDashboard(dashboardId);

    if (!existingDashboard) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Dashboard not found'
      });
    }

    // Check edit permissions
    const canEdit = user.role === AuditRole.ADMIN ||
                   existingDashboard.permissions.edit.includes(user.role);

    if (!canEdit) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions to edit this dashboard'
      });
    }

    const { error, value } = dashboardSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const updatedDashboard: Dashboard = {
      ...value,
      id: dashboardId,
      createdBy: existingDashboard.createdBy,
      createdAt: existingDashboard.createdAt,
      updatedAt: new Date()
    };

    monitoringService.setDashboard(updatedDashboard);

    logger.info('Dashboard updated', {
      dashboardId,
      updatedBy: user.id
    });

    res.json({
      success: true,
      message: 'Dashboard updated successfully',
      data: updatedDashboard
    });

  } catch (error) {
    logger.error('Failed to update dashboard', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update dashboard'
    });
  }
});

/**
 * WebSocket endpoint for real-time metrics
 * GET /monitoring/stream
 */
router.get('/stream',
  authenticateToken,
  requirePermission(AuditPermission.SEARCH_ALL_LOGS),
  async (req: Request, res: Response) => {
  try {
    // Set up Server-Sent Events (SSE)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const user = (req as any).user;
    logger.info('Real-time monitoring stream started', { userId: user.id });

    // Send initial metrics
    const initialMetrics = monitoringService.getMetrics();
    res.write(`data: ${JSON.stringify({
      type: 'metrics',
      data: initialMetrics
    })}\n\n`);

    // Set up event handlers
    const onMetricsUpdated = (metrics: any) => {
      res.write(`data: ${JSON.stringify({
        type: 'metrics',
        data: metrics
      })}\n\n`);
    };

    const onAlertTriggered = (alert: any) => {
      res.write(`data: ${JSON.stringify({
        type: 'alert',
        data: alert
      })}\n\n`);
    };

    monitoringService.on('metricsUpdated', onMetricsUpdated);
    monitoringService.on('alertTriggered', onAlertTriggered);

    // Handle client disconnect
    req.on('close', () => {
      monitoringService.removeListener('metricsUpdated', onMetricsUpdated);
      monitoringService.removeListener('alertTriggered', onAlertTriggered);
      logger.info('Real-time monitoring stream ended', { userId: user.id });
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

  } catch (error) {
    logger.error('Failed to start monitoring stream', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to start monitoring stream'
    });
  }
});

export { router as monitoringRouter };