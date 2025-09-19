/**
 * Log Ingestion Pipeline Service
 * Equivalent to Fluentd/Logstash for collecting, buffering, and routing audit logs
 * Handles high-volume log intake with retry mechanisms and data loss prevention
 */

import { EventEmitter } from 'events';
import { AuditLogEntry, LogLevel, LogCategory } from '../types/audit-log';
import { AuditLogger } from './audit-logger';
import { IntegrityService } from './integrity.service';

interface LogBufferEntry {
  log: AuditLogEntry;
  timestamp: Date;
  retryCount: number;
  originalSize: number;
}

interface IngestionMetrics {
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  bufferSize: number;
  processingLatency: number[];
  lastProcessedAt: Date | null;
}

interface IngestionConfig {
  bufferSize: number;
  flushInterval: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
  compressionEnabled: boolean;
  batchSize: number;
  healthCheckInterval: number;
}

export class LogIngestionService extends EventEmitter {
  private buffer: LogBufferEntry[] = [];
  private metrics: IngestionMetrics;
  private config: IngestionConfig;
  private auditLogger: AuditLogger;
  private integrityService: IntegrityService;
  private flushTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    auditLogger: AuditLogger,
    integrityService: IntegrityService,
    config?: Partial<IngestionConfig>
  ) {
    super();

    this.auditLogger = auditLogger;
    this.integrityService = integrityService;

    this.config = {
      bufferSize: 10000,
      flushInterval: 5000, // 5 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      compressionEnabled: true,
      batchSize: 100,
      healthCheckInterval: 30000, // 30 seconds
      ...config
    };

    this.metrics = {
      totalReceived: 0,
      totalProcessed: 0,
      totalFailed: 0,
      bufferSize: 0,
      processingLatency: [],
      lastProcessedAt: null
    };

    this.startFlushTimer();
    this.startHealthCheck();
  }

  /**
   * Ingest a single audit log entry
   */
  async ingest(log: AuditLogEntry): Promise<void> {
    try {
      // Validate log entry
      this.validateLogEntry(log);

      // Calculate original size for metrics
      const originalSize = JSON.stringify(log).length;

      // Add to buffer
      const bufferEntry: LogBufferEntry = {
        log,
        timestamp: new Date(),
        retryCount: 0,
        originalSize
      };

      this.addToBuffer(bufferEntry);
      this.metrics.totalReceived++;

      // Emit ingestion event
      this.emit('ingested', { log, bufferSize: this.buffer.length });

      // Check if buffer needs immediate flush
      if (this.buffer.length >= this.config.bufferSize) {
        await this.flush();
      }

    } catch (error) {
      this.metrics.totalFailed++;
      this.emit('error', {
        error,
        log,
        message: 'Failed to ingest log entry'
      });
      throw error;
    }
  }

  /**
   * Batch ingest multiple log entries
   */
  async ingestBatch(logs: AuditLogEntry[]): Promise<void> {
    const startTime = Date.now();

    try {
      for (const log of logs) {
        await this.ingest(log);
      }

      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(latency);

      this.emit('batchIngested', {
        count: logs.length,
        latency,
        bufferSize: this.buffer.length
      });

    } catch (error) {
      this.emit('error', {
        error,
        batch: logs,
        message: 'Failed to ingest log batch'
      });
      throw error;
    }
  }

  /**
   * Flush buffer to permanent storage
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.buffer.length === 0) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // Get batch to process
      const batch = this.buffer.splice(0, this.config.batchSize);
      const processedLogs: AuditLogEntry[] = [];

      for (const entry of batch) {
        try {
          // Add integrity hash
          const logWithIntegrity = await this.integrityService.addIntegrityHash(entry.log);

          // Store the log
          await this.auditLogger.log(
            logWithIntegrity.log_level,
            logWithIntegrity.category,
            logWithIntegrity.event_type,
            logWithIntegrity
          );

          processedLogs.push(logWithIntegrity);
          this.metrics.totalProcessed++;

        } catch (error) {
          // Retry logic
          if (entry.retryCount < this.config.maxRetries) {
            entry.retryCount++;
            this.buffer.unshift(entry); // Add back to front for retry

            // Exponential backoff
            setTimeout(() => {
              this.emit('retry', {
                log: entry.log,
                retryCount: entry.retryCount,
                error
              });
            }, this.config.retryDelay * Math.pow(2, entry.retryCount));

          } else {
            this.metrics.totalFailed++;
            this.emit('failed', {
              log: entry.log,
              error,
              retryCount: entry.retryCount
            });
          }
        }
      }

      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(latency);
      this.metrics.lastProcessedAt = new Date();

      this.emit('flushed', {
        processed: processedLogs.length,
        failed: batch.length - processedLogs.length,
        latency,
        bufferSize: this.buffer.length
      });

    } catch (error) {
      this.emit('error', {
        error,
        message: 'Critical error during flush operation'
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get current ingestion metrics
   */
  getMetrics(): IngestionMetrics & { averageLatency: number } {
    const averageLatency = this.metrics.processingLatency.length > 0
      ? this.metrics.processingLatency.reduce((a, b) => a + b, 0) / this.metrics.processingLatency.length
      : 0;

    return {
      ...this.metrics,
      bufferSize: this.buffer.length,
      averageLatency
    };
  }

  /**
   * Get pipeline health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    checks: Record<string, boolean>;
    metrics: ReturnType<typeof this.getMetrics>;
  } {
    const metrics = this.getMetrics();
    const now = Date.now();
    const lastProcessedThreshold = 5 * 60 * 1000; // 5 minutes

    const checks = {
      bufferNotFull: this.buffer.length < this.config.bufferSize * 0.9,
      recentProcessing: metrics.lastProcessedAt
        ? (now - metrics.lastProcessedAt.getTime()) < lastProcessedThreshold
        : metrics.totalReceived === 0,
      lowFailureRate: metrics.totalReceived === 0 ||
        (metrics.totalFailed / metrics.totalReceived) < 0.01,
      acceptableLatency: metrics.averageLatency < 5000 // 5 seconds
    };

    const failedChecks = Object.values(checks).filter(check => !check).length;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (failedChecks >= 2) {
      status = 'critical';
    } else if (failedChecks === 1) {
      status = 'warning';
    }

    return { status, checks, metrics };
  }

  /**
   * Start the service
   */
  start(): void {
    this.startFlushTimer();
    this.startHealthCheck();
    this.emit('started');
  }

  /**
   * Stop the service gracefully
   */
  async stop(): Promise<void> {
    // Stop timers
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Flush remaining buffer
    await this.flush();

    this.emit('stopped');
  }

  private validateLogEntry(log: AuditLogEntry): void {
    if (!log.timestamp || !log.log_level || !log.category || !log.event_type) {
      throw new Error('Invalid log entry: missing required fields');
    }

    if (!Object.values(LogLevel).includes(log.log_level)) {
      throw new Error(`Invalid log level: ${log.log_level}`);
    }

    if (!Object.values(LogCategory).includes(log.category)) {
      throw new Error(`Invalid log category: ${log.category}`);
    }
  }

  private addToBuffer(entry: LogBufferEntry): void {
    this.buffer.push(entry);

    // Prevent memory overflow
    if (this.buffer.length > this.config.bufferSize * 1.1) {
      const overflow = this.buffer.splice(0, Math.floor(this.config.bufferSize * 0.1));
      this.emit('overflow', {
        droppedCount: overflow.length,
        bufferSize: this.buffer.length
      });
    }
  }

  private updateLatencyMetrics(latency: number): void {
    this.metrics.processingLatency.push(latency);

    // Keep only last 100 latency measurements
    if (this.metrics.processingLatency.length > 100) {
      this.metrics.processingLatency.shift();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.emit('error', {
          error,
          message: 'Scheduled flush failed'
        });
      });
    }, this.config.flushInterval);
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      const health = this.getHealthStatus();
      this.emit('healthCheck', health);

      if (health.status === 'critical') {
        this.emit('critical', health);
      }
    }, this.config.healthCheckInterval);
  }
}