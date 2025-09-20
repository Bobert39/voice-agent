import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger, auditLog } from './utils/logger';
import { authenticateToken, optionalAuth, requireActiveUser } from './middleware/auth';

// Import routes
import learningModulesRouter from './routes/learningModules';
import trainingScenariosRouter from './routes/trainingScenarios';
import userProgressRouter from './routes/userProgress';
import trainingSimulatorRouter from './routes/trainingSimulator';
import quickReferenceRouter from './routes/quickReference';
import feedbackRouter from './routes/feedback';
import assessmentRouter from './routes/assessment';
import videoLibraryRouter from './routes/videoLibrary';

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
app.get('/api/quick-reference/cards', optionalAuth, quickReferenceRouter);
app.get('/api/video-library/videos', optionalAuth, videoLibraryRouter);

// Protected routes (authentication required)
app.use('/api/learning-modules', authenticateToken, requireActiveUser, learningModulesRouter);
app.use('/api/training-scenarios', authenticateToken, requireActiveUser, trainingScenariosRouter);
app.use('/api/user-progress', authenticateToken, requireActiveUser, userProgressRouter);
app.use('/api/simulator', authenticateToken, requireActiveUser, trainingSimulatorRouter);
app.use('/api/quick-reference', authenticateToken, requireActiveUser, quickReferenceRouter);
app.use('/api/feedback', authenticateToken, requireActiveUser, feedbackRouter);
app.use('/api/assessment', authenticateToken, requireActiveUser, assessmentRouter);
app.use('/api/video-library', authenticateToken, requireActiveUser, videoLibraryRouter);

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
        'Training Simulator': {
          'GET /api/simulator/scenarios': 'Get available training scenarios',
          'GET /api/simulator/scenarios/:id': 'Get detailed scenario information',
          'POST /api/simulator/start': 'Start a new simulation session',
          'POST /api/simulator/action': 'Process user action during simulation',
          'GET /api/simulator/status/:sessionId': 'Get current simulation status',
          'POST /api/simulator/complete/:sessionId': 'Manually complete simulation (admin)',
          'GET /api/simulator/analytics/scenarios': 'Get scenario performance analytics (admin)'
        },
        'Quick Reference': {
          'GET /api/quick-reference/cards': 'Get all quick reference cards',
          'GET /api/quick-reference/cards/:id': 'Get specific quick reference card',
          'GET /api/quick-reference/cards/:id/printable': 'Get printable version of card',
          'GET /api/quick-reference/categories': 'Get available categories',
          'GET /api/quick-reference/categories/:category/cards': 'Get cards by category',
          'GET /api/quick-reference/search': 'Search quick reference cards',
          'POST /api/quick-reference/cards': 'Create new card (admin only)',
          'PUT /api/quick-reference/cards/:id': 'Update card (admin only)',
          'GET /api/quick-reference/analytics': 'Get usage analytics (admin only)'
        },
        'Feedback System': {
          'POST /api/feedback/submit': 'Submit new feedback from staff',
          'GET /api/feedback': 'Get feedback with optional filtering',
          'GET /api/feedback/:id': 'Get specific feedback item',
          'PUT /api/feedback/:id/status': 'Update feedback status (admin only)',
          'GET /api/feedback/search': 'Search feedback',
          'GET /api/feedback/user/:userId': 'Get feedback by user',
          'GET /api/feedback/pending': 'Get pending feedback for dashboard',
          'GET /api/feedback/analytics': 'Get feedback analytics (admin only)'
        },
        'Assessment System': {
          'POST /api/assessment/start': 'Start a new competency assessment',
          'POST /api/assessment/submit': 'Submit assessment answers',
          'GET /api/assessment/result/:assessmentId': 'Get assessment result',
          'GET /api/assessment/profile/:userId': 'Get user competency profile',
          'GET /api/assessment/learning-path/:pathId': 'Get learning path information',
          'GET /api/assessment/learning-path/:pathId/progress/:userId': 'Get learning path progress',
          'GET /api/assessment/certificate/verify/:verificationCode': 'Verify certificate',
          'GET /api/assessment/analytics': 'Get competency analytics (admin only)'
        },
        'Video Library': {
          'GET /api/video-library/videos': 'Get all training videos',
          'GET /api/video-library/videos/:id': 'Get specific video details',
          'POST /api/video-library/videos/view': 'Record video view for analytics',
          'POST /api/video-library/videos/rating': 'Add or update video rating',
          'POST /api/video-library/videos/comment': 'Add comment to video',
          'GET /api/video-library/playlists': 'Get video playlists',
          'GET /api/video-library/playlists/:id': 'Get specific playlist with videos',
          'GET /api/video-library/search': 'Search videos',
          'GET /api/video-library/recommendations/:userId': 'Get personalized recommendations',
          'GET /api/video-library/analytics/:videoId': 'Get video analytics (admin only)',
          'GET /api/video-library/analytics/content-management': 'Get content metrics (admin only)'
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