import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

// Custom log format for healthcare compliance
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'lms-service',
    environment: nodeEnv
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add file transports for production
if (nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));

  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// HIPAA-compliant logging helper functions
export const auditLog = {
  userAccess: (userId: string, action: string, resource: string, success: boolean) => {
    logger.info('User access event', {
      type: 'USER_ACCESS',
      userId,
      action,
      resource,
      success,
      timestamp: new Date().toISOString(),
      level: 'AUDIT'
    });
  },

  dataAccess: (userId: string, dataType: string, recordId: string, action: string) => {
    logger.info('Data access event', {
      type: 'DATA_ACCESS',
      userId,
      dataType,
      recordId,
      action,
      timestamp: new Date().toISOString(),
      level: 'AUDIT'
    });
  },

  systemEvent: (event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical') => {
    logger.info('System event', {
      type: 'SYSTEM_EVENT',
      event,
      details,
      severity,
      timestamp: new Date().toISOString(),
      level: 'AUDIT'
    });
  },

  securityEvent: (event: string, userId?: string, ipAddress?: string, details?: any) => {
    logger.warn('Security event', {
      type: 'SECURITY_EVENT',
      event,
      userId,
      ipAddress,
      details,
      timestamp: new Date().toISOString(),
      level: 'SECURITY'
    });
  }
};

// Performance logging
export const performanceLog = {
  apiCall: (endpoint: string, method: string, duration: number, statusCode: number, userId?: string) => {
    logger.info('API performance', {
      type: 'API_PERFORMANCE',
      endpoint,
      method,
      duration,
      statusCode,
      userId,
      timestamp: new Date().toISOString()
    });
  },

  training: (userId: string, moduleId: string, action: string, duration: number, success: boolean) => {
    logger.info('Training activity', {
      type: 'TRAINING_PERFORMANCE',
      userId,
      moduleId,
      action,
      duration,
      success,
      timestamp: new Date().toISOString()
    });
  }
};

export default logger;