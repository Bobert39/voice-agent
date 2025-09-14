import { Request, Response, NextFunction } from 'express';
import { BaseError, createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('practice-info-service');

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