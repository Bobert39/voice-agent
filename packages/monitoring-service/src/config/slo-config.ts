/**
 * Service Level Objectives configuration
 * Based on Story 4.3 SLO requirements
 */

import { SLOConfig } from '../types/metrics';

export const sloConfig: SLOConfig = {
  availability: {
    business_hours: {
      target: 0.999, // 99.9% - 43.2 seconds downtime/month
      measurement: 'successful_calls / total_calls',
      window: 'rolling_30_days'
    },
    after_hours: {
      target: 0.995, // 99.5% - 3.6 hours downtime/month
      measurement: 'successful_calls / total_calls',
      window: 'rolling_30_days'
    }
  },

  latency: {
    voice_response: {
      p50: 300, // 300ms
      p95: 800, // 800ms
      p99: 1500, // 1500ms
      measurement: 'time_to_first_word'
    },
    api_calls: {
      openemr: {
        p50: 200,
        p95: 500,
        p99: 1000
      },
      scheduling: {
        p50: 150,
        p95: 400,
        p99: 800
      }
    }
  },

  error_rates: {
    overall: {
      target: 0.001, // <0.1%
      measurement: 'error_responses / total_requests',
      window: 'rolling_5_minutes'
    },
    critical_paths: {
      patient_verification: 0.005, // <0.5%
      appointment_booking: 0.001, // <0.1%
      voice_recognition: 0.02 // <2%
    }
  },

  capacity: {
    concurrent_calls: {
      target: 50,
      warning: 40,
      critical: 45
    },
    database_connections: {
      target: 100,
      warning: 80,
      critical: 90
    }
  }
};

export const businessHours = {
  start: 8, // 8 AM
  end: 17, // 5 PM
  timezone: 'America/Los_Angeles' // Pacific Time
};

export function isBusinessHours(): boolean {
  const now = new Date();
  const pstTime = new Date(now.toLocaleString("en-US", {timeZone: businessHours.timezone}));
  const hour = pstTime.getHours();
  const day = pstTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Monday to Friday, business hours
  return day >= 1 && day <= 5 && hour >= businessHours.start && hour < businessHours.end;
}