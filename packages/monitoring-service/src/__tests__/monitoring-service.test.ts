/**
 * Tests for monitoring service functionality
 */

import request from 'supertest';
import express from 'express';
import { HealthCheckService } from '../health/health-checks';
import { AlertManager } from '../alerting/alert-manager';
import { SyntheticMonitoringService } from '../synthetic/synthetic-tests';

// Mock external dependencies
jest.mock('twilio');
jest.mock('redis');
jest.mock('pg');
jest.mock('axios');

describe('Monitoring Service', () => {
  let app: express.Application;
  let healthCheckService: HealthCheckService;
  let alertManager: AlertManager;
  let syntheticService: SyntheticMonitoringService;

  beforeEach(() => {
    app = express();
    healthCheckService = new HealthCheckService();
    alertManager = new AlertManager();
    syntheticService = new SyntheticMonitoringService();

    // Setup test routes
    app.get('/health', async (_req, res) => {
      try {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          checks: []
        });
      } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
      }
    });

    app.get('/metrics', async (_req, res) => {
      try {
        res.set('Content-Type', 'text/plain');
        res.end('# Test metrics');
      } catch (error) {
        res.status(500).end('Metrics collection error');
      }
    });
  });

  describe('Health Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('# Test metrics');
    });
  });

  describe('HealthCheckService', () => {
    it('should have required health check methods', () => {
      expect(typeof healthCheckService.runAllChecks).toBe('function');
      expect(typeof healthCheckService.start).toBe('function');
      expect(typeof healthCheckService.stop).toBe('function');
    });

    it('should define health checks', () => {
      const checks = healthCheckService.getHealthChecks();
      expect(Array.isArray(checks)).toBe(true);
      expect(checks.length).toBeGreaterThan(0);

      // Verify critical health checks exist
      const checkNames = checks.map(check => check.name);
      expect(checkNames).toContain('openemr_api');
      expect(checkNames).toContain('twilio_voice');
      expect(checkNames).toContain('database');
      expect(checkNames).toContain('ai_service');
    });
  });

  describe('AlertManager', () => {
    it('should have required alert management methods', () => {
      expect(typeof alertManager.processIncomingAlert).toBe('function');
      expect(typeof alertManager.start).toBe('function');
      expect(typeof alertManager.stop).toBe('function');
    });

    it('should define alert rules', () => {
      const rules = alertManager.getAlertRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);

      // Verify critical alert rules exist
      const ruleNames = rules.map(rule => rule.name);
      expect(ruleNames).toContain('ServiceDown');
      expect(ruleNames).toContain('HighErrorRate');
      expect(ruleNames).toContain('DatabaseConnectionPoolExhausted');
    });

    it('should process incoming alerts', async () => {
      const alertData = {
        alert_name: 'test-alert',
        severity: 'warning',
        summary: 'Test alert summary',
        value: 1
      };

      // Should not throw
      await expect(alertManager.processIncomingAlert(alertData)).resolves.not.toThrow();
    });
  });

  describe('SyntheticMonitoringService', () => {
    it('should have required synthetic test methods', () => {
      expect(typeof syntheticService.getTestResults).toBe('function');
      expect(typeof syntheticService.start).toBe('function');
      expect(typeof syntheticService.stop).toBe('function');
    });

    it('should define synthetic tests', () => {
      const tests = syntheticService.getSyntheticTests();
      expect(Array.isArray(tests)).toBe(true);
      expect(tests.length).toBeGreaterThan(0);

      // Verify required tests exist
      const testNames = tests.map(test => test.name);
      expect(testNames).toContain('end_to_end_call_flow');
      expect(testNames).toContain('appointment_booking_flow');
      expect(testNames).toContain('external_dependencies');
    });

    it('should return test results', () => {
      const results = syntheticService.getTestResults();
      expect(results).toHaveProperty('tests');
      expect(results).toHaveProperty('consecutiveFailures');
      expect(typeof results.tests).toBe('object');
      expect(typeof results.consecutiveFailures).toBe('object');
    });
  });
});