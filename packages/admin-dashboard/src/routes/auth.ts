/**
 * Authentication Routes for Staff Dashboard
 * Handles SSO login, token validation, and RBAC
 */

import { Router } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { StaffRole, rolePermissions } from '../types/dashboard';

const logger = createLogger('auth');
const router = Router();

// JWT secret (in production, this should be from environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'dashboard-secret-key';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h';

interface User {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  permissions: string[];
}

// Mock user database (in production, this would be a real database)
const mockUsers: Record<string, User> = {
  'jane.doe@capitoleyecare.com': {
    id: 'user-001',
    name: 'Jane Doe',
    email: 'jane.doe@capitoleyecare.com',
    role: StaffRole.SUPERVISOR,
    permissions: Object.keys(rolePermissions[StaffRole.SUPERVISOR]).filter(
      key => rolePermissions[StaffRole.SUPERVISOR][key as keyof typeof rolePermissions[StaffRole.SUPERVISOR]]
    ),
  },
  'john.smith@capitoleyecare.com': {
    id: 'user-002',
    name: 'John Smith',
    email: 'john.smith@capitoleyecare.com',
    role: StaffRole.RECEPTIONIST,
    permissions: Object.keys(rolePermissions[StaffRole.RECEPTIONIST]).filter(
      key => rolePermissions[StaffRole.RECEPTIONIST][key as keyof typeof rolePermissions[StaffRole.RECEPTIONIST]]
    ),
  },
  'admin@capitoleyecare.com': {
    id: 'user-003',
    name: 'Admin User',
    email: 'admin@capitoleyecare.com',
    role: StaffRole.ADMIN,
    permissions: Object.keys(rolePermissions[StaffRole.ADMIN]).filter(
      key => rolePermissions[StaffRole.ADMIN][key as keyof typeof rolePermissions[StaffRole.ADMIN]]
    ),
  },
};

/**
 * POST /api/auth/login
 * Simulate SSO login (in production, this would redirect to SSO provider)
 */
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;

    // For demo purposes, simulate SSO authentication
    // In production, this would validate with the SSO provider
    const user = mockUsers[email];

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'User not found in staff directory',
      });
    }

    // Generate JWT token
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    const token = jwt.sign(payload, JWT_SECRET, options);

    logger.info(`User ${user.email} logged in successfully`);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error during authentication',
    });
  }
});

/**
 * POST /api/auth/sso-callback
 * Handle SSO callback (for production implementation)
 */
router.post('/sso-callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    // Note: code and state would be used in production SSO flow
    console.log('SSO parameters:', { code, state }); // Demo logging

    // In production, this would:
    // 1. Exchange code for tokens with SSO provider
    // 2. Get user info from SSO provider
    // 3. Map user to internal role/permissions
    // 4. Generate internal JWT token

    // For demo, simulate successful SSO
    const user = mockUsers['jane.doe@capitoleyecare.com'];

    if (!user) {
      return res.status(401).json({
        error: 'SSO user not found',
        message: 'User not found in staff directory',
      });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    const token = jwt.sign(payload, JWT_SECRET, options);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    logger.error('SSO callback error:', error);
    return res.status(500).json({
      error: 'SSO authentication failed',
      message: 'Error processing SSO callback',
    });
  }
});

/**
 * GET /api/auth/validate
 * Validate existing JWT token
 */
router.get('/validate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
        message: 'Authorization header missing or invalid format',
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Get fresh user data (in production, from database)
      const user = mockUsers[decoded.email];
      if (!user) {
        return res.status(401).json({
          error: 'User not found',
          message: 'User no longer exists in staff directory',
        });
      }

      res.json({
        valid: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
        },
      });
    } catch (jwtError) {
      logger.warn('Invalid JWT token:', jwtError);
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is expired or invalid',
      });
    }
  } catch (error) {
    logger.error('Token validation error:', error);
    return res.status(500).json({
      error: 'Validation failed',
      message: 'Internal server error during token validation',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (in production, might blacklist token)
 */
router.post('/logout', async (_req, res) => {
  try {
    // In production, you might:
    // 1. Add token to blacklist
    // 2. Clear SSO session
    // 3. Log the logout event

    logger.info('User logged out');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    return res.status(500).json({
      error: 'Logout failed',
      message: 'Internal server error during logout',
    });
  }
});

/**
 * GET /api/auth/permissions
 * Get current user's permissions
 */
router.get('/permissions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const user = mockUsers[decoded.email];
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
      });
    }

    res.json({
      permissions: user.permissions,
      role: user.role,
    });
  } catch (error) {
    logger.error('Permissions check error:', error);
    return res.status(401).json({
      error: 'Permission check failed',
    });
  }
});

export { router as authRouter };