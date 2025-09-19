import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

// import { createLogger } from '@ai-voice-agent/shared-utils';
// import { SERVICE_PORTS } from '@ai-voice-agent/shared-utils';

// Temporary implementation until shared-utils is available
const createLogger = (service: string) => ({
  info: (message: string, meta?: any) => console.log(`[${service}] INFO:`, message, meta || ''),
  warn: (message: string, meta?: any) => console.log(`[${service}] WARN:`, message, meta || ''),
  error: (message: string, meta?: any) => console.log(`[${service}] ERROR:`, message, meta || '')
});

const SERVICE_PORTS = {
  AUDIT_SERVICE: 8084
};
import { healthRouter } from './routes/health';
import { auditRouter } from './routes/audit';
import { monitoringRouter } from './routes/monitoring';
import { errorHandler } from './middleware/errorHandler';

const logger = createLogger('audit-service');

const app = express();
const port = process.env.PORT || SERVICE_PORTS.AUDIT_SERVICE;

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Service-Token', 'X-MFA-Token']
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
app.use('/audit', auditRouter);
app.use('/monitoring', monitoringRouter);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
  logger.info(`Audit Service listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export default app;