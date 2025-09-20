/**
 * Authentication and Authorization Middleware
 * JWT validation and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { StaffRole, rolePermissions } from '../types/dashboard';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('auth-middleware');
const JWT_SECRET = process.env.JWT_SECRET || 'dashboard-secret-key';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: StaffRole;
        permissions: string[];
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 * Validates JWT token and adds user to request
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No valid authorization header provided',
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions || [],
      };

      next();
    } catch (jwtError) {
      logger.warn(`Invalid JWT token from ${req.ip}:`, jwtError);

      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is expired or invalid',
      });
    }
  } catch (error) {
    logger.error('Authentication middleware error:', error);

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication',
    });
  }
};

/**
 * Optional Authentication Middleware
 * Adds user to request if token is valid, but doesn't require it
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      req.user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions || [],
      };
    } catch (jwtError) {
      // Token invalid, but that's OK for optional auth
      logger.debug('Optional auth - invalid token:', jwtError);
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next();
  }
};

/**
 * Role-Based Access Control Middleware
 * Requires user to have specific role
 */
export const requireRole = (requiredRole: StaffRole) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
    }

    // Admin can access everything
    if (req.user.role === StaffRole.ADMIN) {
      return next();
    }

    // Check if user has required role
    if (req.user.role !== requiredRole) {
      logger.warn(`Access denied for user ${req.user.email} - required role: ${requiredRole}, user role: ${req.user.role}`);

      return res.status(403).json({
        error: 'Insufficient privileges',
        message: `This action requires ${requiredRole} role`,
      });
    }

    next();
  };
};

/**
 * Permission-Based Access Control Middleware
 * Requires user to have specific permission
 */
export const requirePermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
    }

    // Check if user has required permission
    if (!req.user.permissions.includes(requiredPermission)) {
      logger.warn(`Access denied for user ${req.user.email} - required permission: ${requiredPermission}`);

      return res.status(403).json({
        error: 'Insufficient privileges',
        message: `This action requires ${requiredPermission} permission`,
      });
    }

    next();
  };
};

/**
 * Multiple Permissions Middleware
 * Requires user to have ALL specified permissions
 */
export const requireAllPermissions = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
    }

    const missingPermissions = requiredPermissions.filter(
      permission => !req.user!.permissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      logger.warn(`Access denied for user ${req.user.email} - missing permissions: ${missingPermissions.join(', ')}`);

      return res.status(403).json({
        error: 'Insufficient privileges',
        message: `This action requires the following permissions: ${missingPermissions.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Any Permission Middleware
 * Requires user to have AT LEAST ONE of the specified permissions
 */
export const requireAnyPermission = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
    }

    const hasPermission = requiredPermissions.some(
      permission => req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn(`Access denied for user ${req.user.email} - needs one of: ${requiredPermissions.join(', ')}`);

      return res.status(403).json({
        error: 'Insufficient privileges',
        message: `This action requires at least one of: ${requiredPermissions.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Supervisor or Higher Middleware
 * Allows SUPERVISOR and ADMIN roles
 */
export const requireSupervisorOrHigher = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated',
    });
  }

  const allowedRoles = [StaffRole.SUPERVISOR, StaffRole.ADMIN];

  if (!allowedRoles.includes(req.user.role)) {
    logger.warn(`Access denied for user ${req.user.email} - requires supervisor or admin role`);

    return res.status(403).json({
      error: 'Insufficient privileges',
      message: 'This action requires supervisor or administrator privileges',
    });
  }

  next();
};

/**
 * Rate Limiting for Authentication Endpoints
 * Prevents brute force attacks
 */
export const authRateLimit = (req: Request, res: Response, next: NextFunction) => {
  // In production, implement proper rate limiting with Redis
  // For demo, just log the attempt
  logger.info(`Auth attempt from ${req.ip} for ${req.path}`);
  next();
};

/**
 * Audit Logging Middleware
 * Logs all authenticated actions for HIPAA compliance
 */
export const auditLog = (action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Override res.json to capture response
    const originalJson = res.json;
    let responseBody: any;

    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;

      const auditEntry = {
        timestamp: new Date().toISOString(),
        action,
        user: req.user ? {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role,
        } : null,
        request: {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        },
        response: {
          statusCode: res.statusCode,
          success,
          duration,
        },
      };

      // In production, send to audit logging service
      logger.info('Audit log:', auditEntry);
    });

    next();
  };
};