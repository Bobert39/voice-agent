import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import winston from 'winston';
import DatabaseManager, { createDatabaseConfig, createRedisConfig } from './utils/database';
import configurationRoutes from './routes/configuration';
import practiceRoutes from './routes/practice';
import appointmentRoutes from './routes/appointments';
import aiRoutes from './routes/ai';
import backupRoutes from './routes/backup';
import updateRoutes from './routes/updates';
import recoveryRoutes from './routes/recovery';

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Environment configuration
const PORT = process.env.PORT || 3005;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info('HTTP Request:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });
  next();
});

// Simple authentication middleware (replace with your actual auth)
app.use('/api', (req, res, next) => {
  // Skip authentication for health check
  if (req.path === '/config/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      errors: ['Authentication required'],
      message: 'Valid JWT token required',
    });
  }

  // Mock user for development - replace with actual JWT validation
  if (NODE_ENV === 'development') {
    (req as any).user = {
      id: 'dev-user-1',
      practiceId: 'practice-123',
      role: 'admin',
    };
  } else {
    // TODO: Implement actual JWT validation
    // const token = authHeader.substring(7);
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // (req as any).user = decoded;
  }

  next();
});

// API routes
app.use('/api/config', configurationRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/recovery', recoveryRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Configuration Management Service',
    version: '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    errors: ['Internal server error'],
    message: 'An unexpected error occurred',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    errors: ['Endpoint not found'],
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');

  const server = app.listen();
  server.close(async () => {
    try {
      const db = DatabaseManager.getInstance();
      await db.close();
      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error closing database connections:', error);
    }

    process.exit(0);
  });
});

// Initialize database and start server
async function startServer(): Promise<void> {
  try {
    // Initialize database connections
    const db = DatabaseManager.getInstance();

    // Initialize PostgreSQL
    const dbConfig = createDatabaseConfig();
    await db.initializePostgreSQL(dbConfig);
    logger.info('PostgreSQL connection initialized');

    // Initialize Redis
    const redisConfig = createRedisConfig();
    await db.initializeRedis(redisConfig);
    logger.info('Redis connection initialized');

    // Start server
    app.listen(PORT, () => {
      logger.info('Configuration Management Service started:', {
        port: PORT,
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
      });
    });

    // Health check log
    setInterval(async () => {
      try {
        const health = await db.healthCheck();
        logger.debug('Health check:', health);
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 60000); // Every minute

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', { promise, reason });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  startServer();
}

export default app;