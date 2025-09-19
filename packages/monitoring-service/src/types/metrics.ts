/**
 * Metrics type definitions for monitoring service
 * Based on Story 4.3 requirements
 */

export interface ApplicationMetrics {
  // Voice Service Metrics
  voice: {
    activeCalls: number;
    callDuration: number[];
    recognitionAccuracy: number;
    ttsLatency: number[];
    audioQuality: number;
  };

  // API Performance
  api: {
    requestRate: number;
    requestDuration: number[];
    errorRate: number;
    activeConnections: number;
  };

  // Business Metrics
  business: {
    appointmentsScheduled: number;
    verificationSuccess: number;
    escalationRate: number;
    patientSatisfaction: number;
  };

  // Infrastructure Metrics
  infrastructure: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkLatency: number[];
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latency?: number;
  metadata?: Record<string, any>;
  name?: string;
  critical?: boolean;
}

export interface HealthCheck {
  name: string;
  check: () => Promise<HealthStatus>;
  timeout: number;
  critical: boolean;
}

export interface ServiceLevelObjective {
  target: number;
  measurement: string;
  window: string;
}

export interface SLOConfig {
  availability: {
    business_hours: ServiceLevelObjective;
    after_hours: ServiceLevelObjective;
  };
  latency: {
    voice_response: {
      p50: number;
      p95: number;
      p99: number;
      measurement: string;
    };
    api_calls: {
      openemr: {
        p50: number;
        p95: number;
        p99: number;
      };
      scheduling: {
        p50: number;
        p95: number;
        p99: number;
      };
    };
  };
  error_rates: {
    overall: ServiceLevelObjective;
    critical_paths: {
      patient_verification: number;
      appointment_booking: number;
      voice_recognition: number;
    };
  };
  capacity: {
    concurrent_calls: {
      target: number;
      warning: number;
      critical: number;
    };
    database_connections: {
      target: number;
      warning: number;
      critical: number;
    };
  };
}

export interface AlertRule {
  name: string;
  condition: string;
  severity: 'critical' | 'warning' | 'info';
  duration: string;
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
  };
}

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface SyntheticTest {
  name: string;
  scenario: () => Promise<void>;
  frequency: string; // cron expression
  timeout: number;
  alertThreshold: number; // consecutive failures before alert
}

export interface FailoverConfig {
  service: string;
  primaryEndpoint: string;
  fallbackEndpoints: string[];
  healthCheckInterval: number;
  failoverThreshold: number;
  recoveryDelay: number;
}