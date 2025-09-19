import { Request, Response, NextFunction } from 'express';
// import { BaseError, createLogger } from '@ai-voice-agent/shared-utils';

// Temporary implementation until shared-utils is available
class BaseError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

const createLogger = (service: string) => ({
  info: (message: string, meta?: any) => console.log(`[${service}] INFO:`, message, meta || ''),
  warn: (message: string, meta?: any) => console.log(`[${service}] WARN:`, message, meta || ''),
  error: (message: string, meta?: any) => console.log(`[${service}] ERROR:`, message, meta || '')
});

const logger = createLogger('audit-service');

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error (never log PII/PHI)
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Handle known errors
  if (err instanceof BaseError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode
      }
    });
    return;
  }

  // Handle unknown errors - never expose internal details
  res.status(500).json({
    error: {
      message: 'Internal server error',
      status: 500
    }
  });
};