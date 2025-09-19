import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger, auditLog } from '../utils/logger';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'receptionist' | 'nurse' | 'technician' | 'manager' | 'admin';
  department: string;
  experience: 'new' | 'experienced' | 'expert';
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    auditLog.securityEvent('MISSING_TOKEN', undefined, req.ip);
    return res.status(401).json({
      success: false,
      error: {
        message: 'Access token required',
        code: 'NO_TOKEN'
      }
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      auditLog.securityEvent('INVALID_TOKEN', undefined, req.ip, { error: err.message });
      logger.warn('Token verification failed', { error: err.message, ip: req.ip });

      return res.status(403).json({
        success: false,
        error: {
          message: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        }
      });
    }

    req.user = decoded as AuthenticatedUser;
    auditLog.userAccess(req.user.id, 'API_ACCESS', req.path, true);
    next();
  });
};

export const requireRole = (roles: string | string[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      auditLog.securityEvent('INSUFFICIENT_PERMISSIONS', req.user.id, req.ip, {
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });

      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN'
        }
      });
    }

    next();
  };
};

export const requireAdmin = requireRole('admin');

export const requireManagerOrAdmin = requireRole(['manager', 'admin']);

// Optional authentication - doesn't fail if no token, but sets user if valid token present
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // No token, continue without user
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err && decoded) {
      req.user = decoded as AuthenticatedUser;
      auditLog.userAccess(req.user.id, 'API_ACCESS', req.path, true);
    }
    next(); // Continue regardless of token validity for optional auth
  });
};

// Generate JWT token for testing/demo purposes
export const generateToken = (user: AuthenticatedUser): string => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
};

// Demo user for testing
export const createDemoUser = (): AuthenticatedUser => {
  return {
    id: 'demo_user_001',
    username: 'demo_staff',
    email: 'demo@capitoleyecare.com',
    firstName: 'Demo',
    lastName: 'Staff',
    role: 'receptionist',
    department: 'Front Office',
    experience: 'experienced',
    isActive: true
  };
};

// Demo admin user for testing
export const createDemoAdmin = (): AuthenticatedUser => {
  return {
    id: 'demo_admin_001',
    username: 'demo_admin',
    email: 'admin@capitoleyecare.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    department: 'IT',
    experience: 'expert',
    isActive: true
  };
};

// Middleware to check if user's account is active
export const requireActiveUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      }
    });
  }

  if (!req.user.isActive) {
    auditLog.securityEvent('INACTIVE_USER_ACCESS', req.user.id, req.ip);

    return res.status(403).json({
      success: false,
      error: {
        message: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE'
      }
    });
  }

  next();
};