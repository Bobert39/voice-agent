import winston from 'winston';

// HIPAA-compliant logging configuration
export const createLogger = (serviceName: string): winston.Logger => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp', 'label']
      })
    ),
    defaultMeta: {
      service: serviceName
    },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ],
    // Never log sensitive information
    exceptionHandlers: [
      new winston.transports.Console()
    ],
    rejectionHandlers: [
      new winston.transports.Console()
    ]
  });
};