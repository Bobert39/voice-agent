/**
 * Tests for Log Ingestion Service
 * Verifies log buffering, processing, and data loss prevention
 */

import { LogIngestionService } from '../services/log-ingestion.service';
import { AuditLogger } from '../services/audit-logger';
import { IntegrityService } from '../services/integrity.service';
import { AuditLogEntry, LogLevel, LogCategory, EventType, ActionType, ActionStatus, InitiatorType, AuthorizationStatus } from '../types/audit-log';

// Mock dependencies
jest.mock('../services/audit-logger');
jest.mock('../services/integrity.service');

describe('LogIngestionService', () => {
  let ingestionService: LogIngestionService;
  let mockAuditLogger: any;
  let mockIntegrityService: any;

  const createMockLog = (overrides?: Partial<AuditLogEntry>): AuditLogEntry => ({
    timestamp: new Date().toISOString(),
    log_level: LogLevel.INFO,
    category: LogCategory.PATIENT_INTERACTION,
    event_type: EventType.ACCESS,
    patient_id: 'test-patient',
    session_id: 'test-session',
    service: 'test-service',
    action: {
      type: ActionType.RETRIEVE_INFO,
      status: ActionStatus.SUCCESS,
      details: {}
    },
    metadata: {
      ip_address: '127.0.0.1',
      user_agent: 'TestAgent/1.0',
      duration_ms: 100,
      correlation_id: 'test-correlation'
    },
    phi_accessed: false,
    audit_trail: {
      initiator: InitiatorType.PATIENT,
      reason: 'TEST_REASON',
      authorization: AuthorizationStatus.VALID
    },
    ...overrides
  });

  beforeEach(() => {
    mockAuditLogger = {
      log: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockIntegrityService = {
      addIntegrityHash: jest.fn().mockImplementation(log => Promise.resolve(log)),
    } as any;

    ingestionService = new LogIngestionService(
      mockAuditLogger,
      mockIntegrityService,
      {
        bufferSize: 10,
        flushInterval: 1000,
        maxRetries: 2,
        retryDelay: 100,
        batchSize: 5
      }
    );
  });

  afterEach(async () => {
    await ingestionService.stop();
    jest.clearAllMocks();
  });

  describe('Basic Ingestion', () => {
    it('should ingest a single log entry', async () => {
      const log = createMockLog();

      await ingestionService.ingest(log);

      const metrics = ingestionService.getMetrics();
      expect(metrics.totalReceived).toBe(1);
    });

    it('should validate log entry before ingestion', async () => {
      const invalidLog = { ...createMockLog(), timestamp: undefined } as any;

      await expect(ingestionService.ingest(invalidLog)).rejects.toThrow('Invalid log entry');
    });

    it('should handle batch ingestion', async () => {
      const logs = [createMockLog(), createMockLog(), createMockLog()];

      await ingestionService.ingestBatch(logs);

      const metrics = ingestionService.getMetrics();
      expect(metrics.totalReceived).toBe(3);
    });
  });

  describe('Buffer Management', () => {
    it('should flush buffer when size limit reached', async () => {
      const logs = Array.from({ length: 12 }, () => createMockLog());

      for (const log of logs) {
        await ingestionService.ingest(log);
      }

      // Give time for flush
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAuditLogger.log).toHaveBeenCalled();
    });

    it('should handle buffer overflow gracefully', async () => {
      const overflowSpy = jest.fn();
      ingestionService.on('overflow', overflowSpy);

      // Exceed buffer size significantly
      const logs = Array.from({ length: 15 }, () => createMockLog());

      for (const log of logs) {
        await ingestionService.ingest(log);
      }

      expect(overflowSpy).toHaveBeenCalled();
    });
  });

  describe('Flush Operations', () => {
    it('should flush buffer manually', async () => {
      const log = createMockLog();
      await ingestionService.ingest(log);

      await ingestionService.flush();

      expect(mockIntegrityService.addIntegrityHash).toHaveBeenCalledWith(log);
      expect(mockAuditLogger.log).toHaveBeenCalled();
    });

    it('should add integrity hash before storing', async () => {
      const log = createMockLog();
      await ingestionService.ingest(log);
      await ingestionService.flush();

      expect(mockIntegrityService.addIntegrityHash).toHaveBeenCalledWith(log);
    });

    it('should update metrics after processing', async () => {
      const log = createMockLog();
      await ingestionService.ingest(log);
      await ingestionService.flush();

      const metrics = ingestionService.getMetrics();
      expect(metrics.totalProcessed).toBe(1);
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry failed log storage', async () => {
      mockAuditLogger.log
        .mockRejectedValueOnce(new Error('Storage failed'))
        .mockResolvedValueOnce(undefined);

      const retrySpy = jest.fn();
      ingestionService.on('retry', retrySpy);

      const log = createMockLog();
      await ingestionService.ingest(log);
      await ingestionService.flush();

      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(retrySpy).toHaveBeenCalled();
    });

    it('should give up after max retries', async () => {
      mockAuditLogger.log.mockRejectedValue(new Error('Persistent failure'));

      const failedSpy = jest.fn();
      ingestionService.on('failed', failedSpy);

      const log = createMockLog();
      await ingestionService.ingest(log);
      await ingestionService.flush();

      // Wait for all retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(failedSpy).toHaveBeenCalled();
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy status when functioning normally', () => {
      const health = ingestionService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.checks.bufferNotFull).toBe(true);
      expect(health.checks.lowFailureRate).toBe(true);
    });

    it('should report warning when buffer is nearly full', async () => {
      // Fill buffer to 90%
      const logs = Array.from({ length: 9 }, () => createMockLog());
      for (const log of logs) {
        await ingestionService.ingest(log);
      }

      const health = ingestionService.getHealthStatus();
      expect(health.status).toBe('warning');
    });

    it('should emit health check events', (done) => {
      ingestionService.on('healthCheck', (health) => {
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('checks');
        expect(health).toHaveProperty('metrics');
        done();
      });
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track processing latency', async () => {
      const log = createMockLog();
      await ingestionService.ingestBatch([log]);

      const metrics = ingestionService.getMetrics();
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('should maintain latency history within limits', async () => {
      // Process many batches to test latency buffer limit
      for (let i = 0; i < 150; i++) {
        await ingestionService.ingestBatch([createMockLog()]);
      }

      const metrics = ingestionService.getMetrics();
      expect(metrics.processingLatency.length).toBeLessThanOrEqual(100);
    });

    it('should track last processed timestamp', async () => {
      const log = createMockLog();
      await ingestionService.ingest(log);
      await ingestionService.flush();

      const metrics = ingestionService.getMetrics();
      expect(metrics.lastProcessedAt).toBeInstanceOf(Date);
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop gracefully', async () => {
      const startSpy = jest.fn();
      const stopSpy = jest.fn();

      ingestionService.on('started', startSpy);
      ingestionService.on('stopped', stopSpy);

      ingestionService.start();
      expect(startSpy).toHaveBeenCalled();

      await ingestionService.stop();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('should flush remaining buffer on stop', async () => {
      const log = createMockLog();
      await ingestionService.ingest(log);

      await ingestionService.stop();

      expect(mockAuditLogger.log).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    it('should emit ingestion events', (done) => {
      ingestionService.on('ingested', (event) => {
        expect(event).toHaveProperty('log');
        expect(event).toHaveProperty('bufferSize');
        done();
      });

      ingestionService.ingest(createMockLog());
    });

    it('should emit flush events', (done) => {
      ingestionService.on('flushed', (event) => {
        expect(event).toHaveProperty('processed');
        expect(event).toHaveProperty('latency');
        done();
      });

      ingestionService.ingest(createMockLog()).then(() => {
        ingestionService.flush();
      });
    });

    it('should emit error events for critical failures', (done) => {
      ingestionService.on('error', (event) => {
        expect(event).toHaveProperty('error');
        expect(event).toHaveProperty('message');
        done();
      });

      // Trigger error by invalid log
      ingestionService.ingest({} as AuditLogEntry);
    });
  });
});