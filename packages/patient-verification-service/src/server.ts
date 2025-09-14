import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { createLogger } from '@ai-voice-agent/shared-utils';
import { SERVICE_PORTS } from '@ai-voice-agent/shared-utils';
import { healthRouter } from './routes/health';
import { verificationRouter, initializeRoutes } from './routes/verification';
import { errorHandler } from './middleware/errorHandler';
import { PatientVerificationService, VerificationConfig } from './services/patient-verification-service';

const logger = createLogger('patient-verification-service');

const app = express();
const port = process.env.PORT || SERVICE_PORTS.PATIENT_VERIFICATION_SERVICE;

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

// Initialize verification service
const verificationConfig: VerificationConfig = {
  openemr: {
    baseUrl: process.env.OPENEMR_BASE_URL || 'http://localhost:8300',
    clientId: process.env.OPENEMR_CLIENT_ID || '',
    clientSecret: process.env.OPENEMR_CLIENT_SECRET || '',
    username: process.env.OPENEMR_USERNAME || '',
    password: process.env.OPENEMR_PASSWORD || ''
  },
  verification: {
    maxAttempts: parseInt(process.env.VERIFICATION_MAX_ATTEMPTS || '3'),
    sessionTimeoutMinutes: parseInt(process.env.VERIFICATION_SESSION_TIMEOUT || '15'),
    requirePhone: process.env.VERIFICATION_REQUIRE_PHONE === 'true'
  }
};

let verificationService: PatientVerificationService;

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/verification', initializeRoutes(verificationService));

// Global error handler
app.use(errorHandler);

// Initialize and start server
async function startServer() {
  try {
    verificationService = new PatientVerificationService(verificationConfig);
    await verificationService.initialize();
    
    const server = app.listen(port, () => {
      logger.info(`Patient Verification Service listening on port ${port}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully');
      
      server.close(() => {
        verificationService.shutdown().then(() => {
          logger.info('Process terminated');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
}

startServer().catch(error => {
  logger.error('Startup failed', { error });
  process.exit(1);
});

export default app;