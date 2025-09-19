import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger, auditLog } from './utils/logger';
import { authenticateToken, optionalAuth, requireActiveUser } from './middleware/auth';

// Import routes
import learningModulesRouter from './routes/learningModules';
import trainingScenariosRouter from './routes/trainingScenarios';
import userProgressRouter from './routes/userProgress';

const app = express();
const PORT = process.env.PORT || 3006;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'lms-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// Demo authentication endpoints for testing
app.post('/auth/demo-login', (req, res) => {
  try {
    const { role } = req.body;

    let user;
    if (role === 'admin') {
      const { createDemoAdmin, generateToken } = require('./middleware/auth');
      user = createDemoAdmin();
    } else {
      const { createDemoUser, generateToken } = require('./middleware/auth');
      user = createDemoUser();
    }

    const token = generateToken(user);

    auditLog.userAccess(user.id, 'LOGIN', '/auth/demo-login', true);

    res.json({
      success: true,
      data: {
        user,
        token,
        expiresIn: '24h'
      }
    });
  } catch (error) {
    logger.error('Demo login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Demo login failed',
        details: error
      }
    });
  }
});

// Public routes (no authentication required)
app.get('/api/learning-modules', optionalAuth, learningModulesRouter);
app.get('/api/training-scenarios', optionalAuth, trainingScenariosRouter);

// Protected routes (authentication required)
app.use('/api/learning-modules', authenticateToken, requireActiveUser, learningModulesRouter);
app.use('/api/training-scenarios', authenticateToken, requireActiveUser, trainingScenariosRouter);
app.use('/api/user-progress', authenticateToken, requireActiveUser, userProgressRouter);

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'Learning Management System API',
      version: '1.0.0',
      description: 'API for staff training and documentation system',
      endpoints: {
        'Learning Modules': {
          'GET /api/learning-modules': 'Get all learning modules',
          'GET /api/learning-modules/:id': 'Get specific learning module',
          'GET /api/learning-modules/difficulty/:level': 'Get modules by difficulty',
          'POST /api/learning-modules': 'Create new module (admin only)',
          'PUT /api/learning-modules/:id': 'Update module (admin only)',
          'DELETE /api/learning-modules/:id': 'Delete module (admin only)'
        },
        'Training Scenarios': {
          'GET /api/training-scenarios': 'Get all training scenarios',
          'GET /api/training-scenarios/:id': 'Get specific scenario',
          'GET /api/training-scenarios/type/:type': 'Get scenarios by type',
          'GET /api/training-scenarios/difficulty/:level': 'Get scenarios by difficulty',
          'POST /api/training-scenarios': 'Create new scenario (admin only)'
        },
        'User Progress': {
          'GET /api/user-progress/:userId': 'Get user progress',
          'GET /api/user-progress/:userId/module/:moduleId': 'Get module progress',
          'PUT /api/user-progress/:userId/module/:moduleId': 'Update progress',
          'POST /api/user-progress/:userId/module/:moduleId/complete': 'Complete module',
          'POST /api/user-progress/:userId/module/:moduleId/attempt': 'Increment attempt',
          'GET /api/analytics/completion-rate': 'Get completion analytics (admin)',
          'GET /api/analytics/training': 'Get training analytics (admin)',
          'GET /api/users/status/:status': 'Get users by status (admin)'
        },
        'Authentication': {
          'POST /auth/demo-login': 'Demo login for testing',
          'GET /health': 'Health check'
        }
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      code: 'NOT_FOUND'
    }
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);

  auditLog.systemEvent('UNHANDLED_ERROR', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  }, 'high');

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`LMS Service started on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });

  auditLog.systemEvent('SERVICE_STARTED', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  }, 'low');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  auditLog.systemEvent('SERVICE_SHUTDOWN', { signal: 'SIGTERM' }, 'medium');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  auditLog.systemEvent('SERVICE_SHUTDOWN', { signal: 'SIGINT' }, 'medium');
  process.exit(0);
});

export default app;