/**
 * Prometheus metrics definitions and business metrics implementation
 * Based on Story 4.3 custom business metrics requirements
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';

// Patient Experience Metrics
export const patientExperienceMetrics = {
  timeToVerification: new Histogram({
    name: 'patient_verification_duration_seconds',
    help: 'Time taken to verify patient identity',
    buckets: [5, 10, 15, 20, 30, 60],
    labelNames: ['verification_method', 'success']
  }),

  appointmentBookingSuccess: new Counter({
    name: 'appointment_booking_success_total',
    help: 'Successful appointment bookings',
    labelNames: ['appointment_type', 'provider']
  }),

  conversationAbandonment: new Counter({
    name: 'conversation_abandonment_total',
    help: 'Calls ended before completion',
    labelNames: ['abandonment_reason', 'conversation_stage']
  }),

  aiConfidenceScore: new Gauge({
    name: 'ai_confidence_score',
    help: 'AI confidence in understanding patient intent',
    labelNames: ['intent_type']
  })
};

// Voice Service Metrics
export const voiceMetrics = {
  activeCalls: new Gauge({
    name: 'voice_active_calls',
    help: 'Number of currently active voice calls'
  }),

  callDuration: new Histogram({
    name: 'voice_call_duration_seconds',
    help: 'Duration of voice calls',
    buckets: [30, 60, 120, 300, 600, 1200]
  }),

  recognitionAccuracy: new Gauge({
    name: 'voice_recognition_accuracy',
    help: 'Speech recognition accuracy percentage',
    labelNames: ['language', 'audio_quality']
  }),

  ttsLatency: new Histogram({
    name: 'voice_tts_latency_seconds',
    help: 'Text-to-speech conversion latency',
    buckets: [0.1, 0.2, 0.5, 1, 2, 5]
  }),

  audioQuality: new Gauge({
    name: 'voice_audio_quality_score',
    help: 'Audio quality score from 0-100',
    labelNames: ['codec', 'bandwidth']
  })
};

// API Performance Metrics
export const apiMetrics = {
  requestRate: new Counter({
    name: 'api_requests_total',
    help: 'Total number of API requests',
    labelNames: ['method', 'endpoint', 'status_code']
  }),

  requestDuration: new Histogram({
    name: 'api_request_duration_seconds',
    help: 'API request duration',
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    labelNames: ['method', 'endpoint']
  }),

  errorRate: new Counter({
    name: 'api_errors_total',
    help: 'Total number of API errors',
    labelNames: ['method', 'endpoint', 'error_type']
  }),

  activeConnections: new Gauge({
    name: 'api_active_connections',
    help: 'Number of active API connections',
    labelNames: ['service']
  })
};

// Business Metrics
export const businessMetrics = {
  appointmentsScheduled: new Counter({
    name: 'appointments_scheduled_total',
    help: 'Total appointments scheduled',
    labelNames: ['appointment_type', 'provider', 'source']
  }),

  verificationSuccess: new Counter({
    name: 'patient_verification_success_total',
    help: 'Successful patient verifications',
    labelNames: ['verification_method']
  }),

  escalationRate: new Counter({
    name: 'escalations_total',
    help: 'Total escalations to human staff',
    labelNames: ['escalation_reason', 'conversation_stage']
  }),

  patientSatisfaction: new Gauge({
    name: 'patient_satisfaction_score',
    help: 'Patient satisfaction score from surveys',
    labelNames: ['survey_type']
  })
};

// Infrastructure Metrics
export const infrastructureMetrics = {
  cpuUsage: new Gauge({
    name: 'infrastructure_cpu_usage_percent',
    help: 'CPU usage percentage',
    labelNames: ['service', 'instance']
  }),

  memoryUsage: new Gauge({
    name: 'infrastructure_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['service', 'instance']
  }),

  diskUsage: new Gauge({
    name: 'infrastructure_disk_usage_bytes',
    help: 'Disk usage in bytes',
    labelNames: ['service', 'instance', 'mount_point']
  }),

  networkLatency: new Histogram({
    name: 'infrastructure_network_latency_seconds',
    help: 'Network latency between services',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    labelNames: ['source_service', 'target_service']
  })
};

// Health Check Metrics
export const healthMetrics = {
  healthCheckStatus: new Gauge({
    name: 'health_check_status',
    help: 'Health check status (1=healthy, 0=unhealthy)',
    labelNames: ['service', 'check_name']
  }),

  healthCheckDuration: new Histogram({
    name: 'health_check_duration_seconds',
    help: 'Health check duration',
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    labelNames: ['service', 'check_name']
  }),

  lastHealthCheck: new Gauge({
    name: 'health_check_last_success_timestamp',
    help: 'Timestamp of last successful health check',
    labelNames: ['service', 'check_name']
  })
};

// Export all metrics grouped for easy access
export const allMetrics = {
  patient: patientExperienceMetrics,
  voice: voiceMetrics,
  api: apiMetrics,
  business: businessMetrics,
  infrastructure: infrastructureMetrics,
  health: healthMetrics
};

// Function to get all registered metrics for export
export function getMetricsRegistry() {
  return register;
}

// Function to record a patient verification attempt
export function recordPatientVerification(
  method: string,
  success: boolean,
  duration: number
): void {
  patientExperienceMetrics.timeToVerification
    .labels(method, success.toString())
    .observe(duration);

  if (success) {
    businessMetrics.verificationSuccess
      .labels(method)
      .inc();
  }
}

// Function to record appointment booking
export function recordAppointmentBooking(
  appointmentType: string,
  provider: string,
  source: string = 'voice'
): void {
  patientExperienceMetrics.appointmentBookingSuccess
    .labels(appointmentType, provider)
    .inc();

  businessMetrics.appointmentsScheduled
    .labels(appointmentType, provider, source)
    .inc();
}

// Function to record conversation abandonment
export function recordConversationAbandonment(
  reason: string,
  stage: string
): void {
  patientExperienceMetrics.conversationAbandonment
    .labels(reason, stage)
    .inc();
}

// Function to update AI confidence score
export function updateAIConfidence(
  intentType: string,
  confidence: number
): void {
  patientExperienceMetrics.aiConfidenceScore
    .labels(intentType)
    .set(confidence);
}

// Function to record escalation
export function recordEscalation(
  reason: string,
  stage: string
): void {
  businessMetrics.escalationRate
    .labels(reason, stage)
    .inc();
}