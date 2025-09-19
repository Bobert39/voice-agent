/**
 * Role-Based Access Control (RBAC) middleware for audit service
 * Implements HIPAA-compliant access controls for audit data
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export enum AuditRole {
  // System roles - automated access
  SYSTEM = 'system',
  SERVICE = 'service',

  // Staff roles - human access
  ADMIN = 'admin',
  COMPLIANCE_OFFICER = 'compliance_officer',
  AUDIT_VIEWER = 'audit_viewer',
  PROVIDER = 'provider',
  NURSE = 'nurse',
  RECEPTIONIST = 'receptionist',

  // Readonly roles
  AUDITOR = 'auditor',
  READONLY = 'readonly'
}

export enum AuditPermission {
  // Logging permissions
  LOG_PATIENT_INTERACTION = 'log_patient_interaction',
  LOG_SYSTEM_ACTIVITY = 'log_system_activity',
  LOG_SECURITY_EVENT = 'log_security_event',
  LOG_COMPLIANCE_EVENT = 'log_compliance_event',

  // Query permissions
  SEARCH_ALL_LOGS = 'search_all_logs',
  SEARCH_OWN_LOGS = 'search_own_logs',
  SEARCH_PATIENT_LOGS = 'search_patient_logs',

  // Report permissions
  GENERATE_AUDIT_REPORTS = 'generate_audit_reports',
  GENERATE_COMPLIANCE_REPORTS = 'generate_compliance_reports',

  // Admin permissions
  MANAGE_RETENTION_POLICIES = 'manage_retention_policies',
  ACCESS_RAW_LOGS = 'access_raw_logs',
  EXPORT_LOGS = 'export_logs'
}

interface AuthenticatedUser {
  id: string;
  role: AuditRole;
  permissions: AuditPermission[];
  staffId?: string;
  email?: string;
  practiceId?: string;
}

// Role to permissions mapping
const ROLE_PERMISSIONS: Record<AuditRole, AuditPermission[]> = {
  [AuditRole.SYSTEM]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.LOG_SYSTEM_ACTIVITY,
    AuditPermission.LOG_SECURITY_EVENT,
    AuditPermission.LOG_COMPLIANCE_EVENT
  ],

  [AuditRole.SERVICE]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.LOG_SYSTEM_ACTIVITY,
    AuditPermission.LOG_SECURITY_EVENT,
    AuditPermission.LOG_COMPLIANCE_EVENT
  ],

  [AuditRole.ADMIN]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.LOG_SYSTEM_ACTIVITY,
    AuditPermission.LOG_SECURITY_EVENT,
    AuditPermission.LOG_COMPLIANCE_EVENT,
    AuditPermission.SEARCH_ALL_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS,
    AuditPermission.GENERATE_AUDIT_REPORTS,
    AuditPermission.GENERATE_COMPLIANCE_REPORTS,
    AuditPermission.MANAGE_RETENTION_POLICIES,
    AuditPermission.ACCESS_RAW_LOGS,
    AuditPermission.EXPORT_LOGS
  ],

  [AuditRole.COMPLIANCE_OFFICER]: [
    AuditPermission.SEARCH_ALL_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS,
    AuditPermission.GENERATE_AUDIT_REPORTS,
    AuditPermission.GENERATE_COMPLIANCE_REPORTS,
    AuditPermission.EXPORT_LOGS
  ],

  [AuditRole.AUDIT_VIEWER]: [
    AuditPermission.SEARCH_ALL_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS,
    AuditPermission.GENERATE_AUDIT_REPORTS
  ],

  [AuditRole.PROVIDER]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.SEARCH_OWN_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS
  ],

  [AuditRole.NURSE]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.SEARCH_OWN_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS
  ],

  [AuditRole.RECEPTIONIST]: [
    AuditPermission.LOG_PATIENT_INTERACTION,
    AuditPermission.SEARCH_OWN_LOGS
  ],

  [AuditRole.AUDITOR]: [
    AuditPermission.SEARCH_ALL_LOGS,
    AuditPermission.SEARCH_PATIENT_LOGS,
    AuditPermission.GENERATE_AUDIT_REPORTS,
    AuditPermission.GENERATE_COMPLIANCE_REPORTS
  ],

  [AuditRole.READONLY]: [
    AuditPermission.SEARCH_OWN_LOGS
  ]
};

/**
 * JWT Authentication middleware
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({
      error: 'Access denied',
      message: 'Authentication token required'
    });
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Validate required fields
    if (!decoded.id || !decoded.role) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Token missing required fields'
      });
      return;
    }

    // Create authenticated user object
    const user: AuthenticatedUser = {
      id: decoded.id,
      role: decoded.role as AuditRole,
      permissions: ROLE_PERMISSIONS[decoded.role as AuditRole] || [],
      staffId: decoded.staffId,
      email: decoded.email,
      practiceId: decoded.practiceId
    };

    // Attach user to request
    (req as any).user = user;
    next();

  } catch (error) {
    res.status(403).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(...permissions: AuditPermission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    // Check if user has all required permissions
    const hasAllPermissions = permissions.every(permission =>
      user.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `Required permissions: ${permissions.join(', ')}`,
        userPermissions: user.permissions
      });
      return;
    }

    next();
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...roles: AuditRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: 'Insufficient role',
        message: `Required roles: ${roles.join(', ')}`,
        userRole: user.role
      });
      return;
    }

    next();
  };
}

/**
 * Service authentication for internal service-to-service calls
 */
export function authenticateService(req: Request, res: Response, next: NextFunction): void {
  const serviceToken = req.headers['x-service-token'] as string;

  if (!serviceToken) {
    res.status(401).json({
      error: 'Service authentication required',
      message: 'X-Service-Token header required for service calls'
    });
    return;
  }

  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN || 'default-service-token';

  if (serviceToken !== expectedToken) {
    res.status(403).json({
      error: 'Invalid service token',
      message: 'Service authentication failed'
    });
    return;
  }

  // Create service user
  const serviceUser: AuthenticatedUser = {
    id: 'service',
    role: AuditRole.SERVICE,
    permissions: ROLE_PERMISSIONS[AuditRole.SERVICE]
  };

  (req as any).user = serviceUser;
  next();
}

/**
 * Multi-factor authentication check for sensitive operations
 */
export function requireMFA(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthenticatedUser;
  const mfaToken = req.headers['x-mfa-token'] as string;

  if (!user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated'
    });
    return;
  }

  // Skip MFA for system/service accounts
  if (user.role === AuditRole.SYSTEM || user.role === AuditRole.SERVICE) {
    next();
    return;
  }

  if (!mfaToken) {
    res.status(401).json({
      error: 'MFA required',
      message: 'Multi-factor authentication token required for this operation'
    });
    return;
  }

  // TODO: Implement actual MFA verification
  // For now, accept any non-empty token
  if (mfaToken.length < 6) {
    res.status(401).json({
      error: 'Invalid MFA token',
      message: 'MFA token must be at least 6 characters'
    });
    return;
  }

  next();
}

/**
 * IP whitelist check for administrative operations
 */
export function requireWhitelistedIP(req: Request, res: Response, next: NextFunction): void {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const allowedIPs = (process.env.ADMIN_ALLOWED_IPS || '127.0.0.1,::1').split(',');

  if (!allowedIPs.includes(clientIP)) {
    res.status(403).json({
      error: 'IP not whitelisted',
      message: `Access denied from IP: ${clientIP}`
    });
    return;
  }

  next();
}

/**
 * Rate limiting for sensitive operations
 */
export function rateLimitSensitive(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement Redis-based rate limiting
  // For now, this is a placeholder

  const user = (req as any).user as AuthenticatedUser;
  const rateLimitKey = `audit_rate_limit:${user?.id || 'anonymous'}:${Date.now()}`;

  // Mock rate limiting - in production, use Redis
  next();
}

/**
 * Audit access logging middleware
 */
export function logAuditAccess(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthenticatedUser;
  const startTime = Date.now();

  // Log the access attempt
  console.log(`[AUDIT ACCESS] ${user?.role || 'anonymous'} ${req.method} ${req.path}`, {
    userId: user?.id,
    staffId: user?.staffId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Override response end to log completion
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    const duration = Date.now() - startTime;
    console.log(`[AUDIT ACCESS COMPLETE] ${res.statusCode} in ${duration}ms`, {
      userId: user?.id,
      path: req.path,
      statusCode: res.statusCode,
      duration
    });

    originalEnd.apply(this, args);
  };

  next();
}

// Export types for use in other modules
export type { AuthenticatedUser };