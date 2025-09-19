/**
 * Logger utility for HIPAA-compliant audit logging
 */

import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';

// Custom format for HIPAA compliance
const hipaaFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    // Remove any potential PHI from logs
    const sanitizedMetadata = sanitizeMetadata(metadata);

    return JSON.stringify({
      timestamp,
      level,
      service: 'nlu-service',
      message,
      ...sanitizedMetadata
    });
  })
);

// Sanitize metadata to remove PHI
function sanitizeMetadata(metadata: any): any {
  const sensitiveFields = [
    'patientName',
    'patientId',
    'dateOfBirth',
    'phone',
    'email',
    'ssn',
    'address'
  ];

  const sanitized = { ...metadata };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeMetadata(sanitized[key]);
    }
  }

  return sanitized;
}

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: hipaaFormat,
  defaultMeta: { service: 'nlu-service' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // File transport for audit logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'nlu-error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),

    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'nlu-audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Add CloudWatch transport in production
if (process.env.NODE_ENV === 'production') {
  // CloudWatch integration would go here
  // Using AWS SDK to send logs to CloudWatch
}

// Log unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});