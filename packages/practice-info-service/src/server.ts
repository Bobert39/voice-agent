import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { createLogger } from '@ai-voice-agent/shared-utils';
import { SERVICE_PORTS } from '@ai-voice-agent/shared-utils';
import { healthRouter } from './routes/health';
import practiceInfoRouter from './routes/practice-info';
import { errorHandler } from './middleware/errorHandler';
import { practiceInfoService } from './services/practice-info-service';

const logger = createLogger('practice-info-service');

const app = express();
const port = process.env.PORT || SERVICE_PORTS.PRACTICE_INFO_SERVICE;

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
app.use('/api/v1/practice-info', practiceInfoRouter);

// Global error handler
app.use(errorHandler);

// Initialize service and start server
async function startServer() {
  try {
    await practiceInfoService.initialize();
    
    const server = app.listen(port, () => {
      logger.info(`Practice Info Service listening on port ${port}`);
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async () => {
      logger.info('Graceful shutdown initiated');
      
      try {
        await practiceInfoService.shutdown();
        server.close(() => {
          logger.info('Practice Info Service shut down gracefully');
          process.exit(0);
        });
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start Practice Info Service', { error });
    process.exit(1);
  }
}

startServer();

export default app;