/**
 * Main monitoring service entry point
 * Implements Story 4.3: Performance Monitoring and Alerting
 */

import express from 'express';
import { register } from 'prom-client';
import createPrometheusMetrics from 'prometheus-api-metrics';
import winston from 'winston';
import { HealthCheckService } from './health/health-checks';
import { AlertManager } from './alerting/alert-manager';
import { SyntheticMonitoringService } from './synthetic/synthetic-tests';
import { sloConfig } from './config/slo-config';
// Import for metrics side effects (registers metrics with prometheus)
import './metrics/prometheus-metrics';

const app = express();
const port = process.env.MONITORING_PORT || 3006;

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'monitoring.log' })
  ]
});

// Initialize services
const healthCheckService = new HealthCheckService();
const alertManager = new AlertManager();
const syntheticTestRunner = new SyntheticMonitoringService();

// Middleware
app.use(express.json());
app.use(createPrometheusMetrics({}));

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const healthStatus = await healthCheckService.runAllChecks();
    const overallStatus = healthStatus.every(check => check.status === 'healthy') ? 'healthy' : 'degraded';

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: healthStatus
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      message: 'Health check service error'
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).end('Metrics collection error');
  }
});

// Status dashboard endpoint
app.get('/status', async (_req, res) => {
  try {
    const healthStatus = await healthCheckService.runAllChecks();
    const criticalServices = healthStatus.filter(check => check.critical);
    const healthyServices = criticalServices.filter(check => check.status === 'healthy').length;
    const totalServices = criticalServices.length;

    const overallAvailability = totalServices > 0 ? (healthyServices / totalServices) * 100 : 100;

    res.json({
      timestamp: new Date().toISOString(),
      availability: `${overallAvailability.toFixed(1)}%`,
      services: {
        total: totalServices,
        healthy: healthyServices,
        degraded: criticalServices.filter(check => check.status === 'degraded').length,
        unhealthy: criticalServices.filter(check => check.status === 'unhealthy').length
      },
      slos: sloConfig,
      checks: healthStatus
    });
  } catch (error) {
    logger.error('Status dashboard error:', error);
    res.status(500).json({ error: 'Status dashboard unavailable' });
  }
});

// Synthetic test results endpoint
app.get('/synthetic', async (_req, res) => {
  try {
    const testResults = await syntheticTestRunner.getTestResults();
    res.json({
      timestamp: new Date().toISOString(),
      results: testResults
    });
  } catch (error) {
    logger.error('Synthetic test results error:', error);
    res.status(500).json({ error: 'Synthetic test results unavailable' });
  }
});

// Alert webhook endpoint for external systems
app.post('/alerts/webhook', async (req, res) => {
  try {
    const alertData = req.body;
    await alertManager.processIncomingAlert(alertData);
    res.status(200).json({ message: 'Alert processed' });
  } catch (error) {
    logger.error('Alert webhook processing failed:', error);
    res.status(500).json({ error: 'Alert processing failed' });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
    // Stop synthetic tests
    await syntheticTestRunner.stop();

    // Close health check service
    await healthCheckService.stop();

    // Close alert manager
    await alertManager.stop();

    logger.info('Monitoring service shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(port, () => {
  logger.info(`Monitoring service started on port ${port}`);

  // Initialize services
  healthCheckService.start();
  syntheticTestRunner.start();
  alertManager.start();

  logger.info('All monitoring services initialized');
});

export default app;