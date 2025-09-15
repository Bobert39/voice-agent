import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { createLogger } from '@voice-agent/shared-utils';
import { SERVICE_PORTS } from '@voice-agent/shared-utils';
import { healthRouter } from './routes/health';
import { createSchedulingRoutes } from './routes/scheduling';
import { errorHandler } from './middleware/errorHandler';
import { SchedulingService } from './services/scheduling-service';
import { SchedulingServiceConfig } from './types';

const logger = createLogger('scheduling-service');

const app = express();
const port = process.env.PORT || SERVICE_PORTS.SCHEDULING_SERVICE;

// Initialize scheduling service
const config: SchedulingServiceConfig = {
  openemr: {
    baseUrl: process.env.OPENEMR_BASE_URL || 'http://localhost:300',
    clientId: process.env.OPENEMR_CLIENT_ID || 'scheduling-service',
    clientSecret: process.env.OPENEMR_CLIENT_SECRET || 'secret',
    site: process.env.OPENEMR_SITE || 'default'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL || '300')
  },
  businessRules: {
    businessHours: {
      monday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      tuesday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      wednesday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      thursday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      friday: { open: '08:00', close: '17:00', lunchStart: '12:00', lunchEnd: '13:00' }
    },
    appointmentDurations: {
      routine: 60,
      'follow-up': 30,
      urgent: 45
    },
    bufferTimes: {
      standard: 10,
      complex: 15
    },
    holidays: [], // Would be loaded from configuration
    blockedTimes: [
      {
        dayOfWeek: 'Friday',
        startTime: '16:00',
        endTime: '17:00',
        reason: 'Weekly staff meeting'
      }
    ]
  }
};

const schedulingService = new SchedulingService(config);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration for healthcare environment
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression and parsing
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Routes
app.use('/health', healthRouter);
app.use('/api/scheduling', createSchedulingRoutes(schedulingService));

// Global error handler
app.use(errorHandler);

// Initialize service and start server
schedulingService.initialize().then(() => {
  const server = app.listen(port, () => {
    logger.info(`Scheduling Service listening on port ${port}`);
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('Shutting down gracefully...');
    await schedulingService.cleanup();
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}).catch((error) => {
  logger.error('Failed to initialize scheduling service', { error });
  process.exit(1);
});

export default app;