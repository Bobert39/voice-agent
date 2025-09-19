/**
 * Health check implementations for all external dependencies
 * Based on Story 4.3 health check requirements
 */

import axios from 'axios';
import { Twilio } from 'twilio';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { HealthCheck, HealthStatus } from '../types/metrics';
import { healthMetrics } from '../metrics/prometheus-metrics';

export class HealthCheckService {
  private twilioClient: Twilio;
  private redisClient: any;
  private dbPool: Pool;

  constructor() {
    // Initialize clients
    this.twilioClient = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5, // Small pool for health checks
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async recordHealthCheck(
    service: string,
    checkName: string,
    status: HealthStatus,
    duration: number
  ): Promise<void> {
    const statusValue = status.status === 'healthy' ? 1 : 0;

    healthMetrics.healthCheckStatus
      .labels(service, checkName)
      .set(statusValue);

    healthMetrics.healthCheckDuration
      .labels(service, checkName)
      .observe(duration / 1000); // Convert to seconds

    if (status.status === 'healthy') {
      healthMetrics.lastHealthCheck
        .labels(service, checkName)
        .set(Date.now() / 1000);
    }
  }

  // OpenEMR API Health Check
  async checkOpenEMR(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await this.withTimeout(
        axios.get(`${process.env.OPENEMR_BASE_URL}/apis/default/api/facility`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENEMR_ACCESS_TOKEN}`
          },
          timeout: 4000
        }),
        5000,
        'OpenEMR API check'
      );

      const latency = Date.now() - start;
      const status: HealthStatus = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        latency,
        metadata: {
          version: response.headers['x-api-version'] || 'unknown',
          responseSize: JSON.stringify(response.data).length
        }
      };

      await this.recordHealthCheck('openemr', 'api_connectivity', status, latency);
      return status;

    } catch (error) {
      const latency = Date.now() - start;
      const status: HealthStatus = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency
      };

      await this.recordHealthCheck('openemr', 'api_connectivity', status, latency);
      return status;
    }
  }

  // Twilio Voice Service Health Check
  async checkTwilio(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Check account status and balance
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      if (!accountSid) {
        throw new Error('TWILIO_ACCOUNT_SID not configured');
      }

      const account = await this.withTimeout(
        this.twilioClient.api.accounts(accountSid).fetch(),
        3000,
        'Twilio account check'
      ) as any;

      const balance = await this.withTimeout(
        this.twilioClient.api.accounts(accountSid).balance.fetch(),
        3000,
        'Twilio balance check'
      ) as any;

      const latency = Date.now() - start;
      const balanceAmount = parseFloat(balance.balance);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message: string | undefined;

      if (account.status !== 'active') {
        status = 'unhealthy';
        message = `Account status: ${account.status}`;
      } else if (balanceAmount < 10) {
        status = 'degraded';
        message = `Low balance: $${balanceAmount}`;
      }

      const healthStatus: HealthStatus = {
        status,
        message,
        latency,
        metadata: {
          accountStatus: account.status,
          balance: balanceAmount,
          currency: balance.currency
        }
      };

      await this.recordHealthCheck('twilio', 'voice_service', healthStatus, latency);
      return healthStatus;

    } catch (error) {
      const latency = Date.now() - start;
      const status: HealthStatus = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency
      };

      await this.recordHealthCheck('twilio', 'voice_service', status, latency);
      return status;
    }
  }

  // Database Health Check
  async checkDatabase(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const client = await this.withTimeout(
        this.dbPool.connect(),
        2000,
        'Database connection'
      );

      try {
        // Simple query to test connection and performance
        const result = await this.withTimeout(
          client.query('SELECT 1 as health_check, NOW() as timestamp'),
          1000,
          'Database query'
        );

        const latency = Date.now() - start;
        const status: HealthStatus = {
          status: 'healthy',
          latency,
          metadata: {
            serverTime: result.rows[0].timestamp,
            connectionCount: this.dbPool.totalCount,
            idleCount: this.dbPool.idleCount,
            waitingCount: this.dbPool.waitingCount
          }
        };

        await this.recordHealthCheck('database', 'postgresql', status, latency);
        return status;

      } finally {
        client.release();
      }

    } catch (error) {
      const latency = Date.now() - start;
      const status: HealthStatus = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency
      };

      await this.recordHealthCheck('database', 'postgresql', status, latency);
      return status;
    }
  }

  // Redis Cache Health Check
  async checkRedis(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }

      // Test set and get operations
      const testKey = `health_check_${Date.now()}`;
      const testValue = 'health_test';

      await this.withTimeout(
        this.redisClient.setEx(testKey, 10, testValue),
        1000,
        'Redis SET operation'
      );

      const retrievedValue = await this.withTimeout(
        this.redisClient.get(testKey),
        1000,
        'Redis GET operation'
      );

      // Clean up test key
      await this.redisClient.del(testKey);

      const latency = Date.now() - start;
      const isHealthy = retrievedValue === testValue;

      const status: HealthStatus = {
        status: isHealthy ? 'healthy' : 'degraded',
        latency,
        metadata: {
          testKeySet: testValue,
          testKeyRetrieved: retrievedValue,
          connected: this.redisClient.isOpen
        }
      };

      await this.recordHealthCheck('redis', 'cache_operations', status, latency);
      return status;

    } catch (error) {
      const latency = Date.now() - start;
      const status: HealthStatus = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency
      };

      await this.recordHealthCheck('redis', 'cache_operations', status, latency);
      return status;
    }
  }

  // AI Service (OpenAI GPT-4) Health Check
  async checkAIService(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      // Simple completion to test API availability and quota
      const response = await this.withTimeout(
        axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4-turbo-preview',
            messages: [
              { role: 'user', content: 'Health check - respond with OK' }
            ],
            max_tokens: 5,
            temperature: 0
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 4000
          }
        ),
        5000,
        'OpenAI API check'
      );

      const latency = Date.now() - start;
      const usage = response.data.usage;

      const status: HealthStatus = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        latency,
        metadata: {
          model: response.data.model,
          tokensUsed: usage?.total_tokens || 0,
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0
        }
      };

      await this.recordHealthCheck('ai_service', 'openai_api', status, latency);
      return status;

    } catch (error) {
      const latency = Date.now() - start;
      let message = 'Unknown error';

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          message = 'Rate limited - quota exceeded';
        } else if (error.response?.status === 401) {
          message = 'Authentication failed - invalid API key';
        } else {
          message = error.message;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }

      const status: HealthStatus = {
        status: 'unhealthy',
        message,
        latency
      };

      await this.recordHealthCheck('ai_service', 'openai_api', status, latency);
      return status;
    }
  }

  // Get all health checks configuration
  getHealthChecks(): HealthCheck[] {
    return [
      {
        name: 'openemr_api',
        check: () => this.checkOpenEMR(),
        timeout: 5000,
        critical: true
      },
      {
        name: 'twilio_voice',
        check: () => this.checkTwilio(),
        timeout: 3000,
        critical: true
      },
      {
        name: 'database',
        check: () => this.checkDatabase(),
        timeout: 2000,
        critical: true
      },
      {
        name: 'redis_cache',
        check: () => this.checkRedis(),
        timeout: 1000,
        critical: false
      },
      {
        name: 'ai_service',
        check: () => this.checkAIService(),
        timeout: 5000,
        critical: true
      }
    ];
  }

  // Run all health checks
  async runAllHealthChecks(): Promise<Record<string, HealthStatus>> {
    const checks = this.getHealthChecks();
    const results: Record<string, HealthStatus> = {};

    await Promise.allSettled(
      checks.map(async (check) => {
        try {
          const result = await check.check();
          results[check.name] = result;
        } catch (error) {
          results[check.name] = {
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Health check failed'
          };
        }
      })
    );

    return results;
  }

  // Get overall system health
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, HealthStatus>;
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      critical_failures: number;
    };
  }> {
    const checks = await this.runAllHealthChecks();
    const healthCheckConfigs = this.getHealthChecks();

    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let criticalFailures = 0;

    for (const [name, status] of Object.entries(checks)) {
      const config = healthCheckConfigs.find(c => c.name === name);

      switch (status.status) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'unhealthy':
          unhealthy++;
          if (config?.critical) {
            criticalFailures++;
          }
          break;
      }
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalFailures > 0) {
      overallStatus = 'unhealthy';
    } else if (unhealthy > 0 || degraded > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      checks,
      summary: {
        total: Object.keys(checks).length,
        healthy,
        degraded,
        unhealthy,
        critical_failures: criticalFailures
      }
    };
  }

  // Alias for runAllHealthChecks to match interface expectations
  async runAllChecks(): Promise<HealthStatus[]> {
    const checks = await this.runAllHealthChecks();
    const configs = this.getHealthChecks();

    return configs.map(config => {
      const checkResult = checks[config.name];
      return {
        status: checkResult?.status || 'unhealthy',
        message: checkResult?.message,
        latency: checkResult?.latency,
        metadata: checkResult?.metadata,
        name: config.name,
        critical: config.critical
      };
    });
  }

  // Start health monitoring (placeholder for future periodic checks)
  async start(): Promise<void> {
    // Connect Redis client if needed
    if (!this.redisClient.isOpen) {
      await this.redisClient.connect();
    }
    console.log('Health check service started');
  }

  // Stop health monitoring and cleanup
  async stop(): Promise<void> {
    await this.cleanup();
  }

  // Cleanup resources
  async cleanup(): Promise<void> {
    try {
      if (this.redisClient?.isOpen) {
        await this.redisClient.quit();
      }
      await this.dbPool.end();
    } catch (error) {
      console.error('Error during health check service cleanup:', error);
    }
  }
}