import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';

import { createLogger } from '@ai-voice-agent/shared-utils';
import { SERVICE_PORTS } from '@ai-voice-agent/shared-utils';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { errorHandler } from './middleware/errorHandler';
import { createGraphQLServer } from './api/graphql-server';
import { DashboardWebSocketServer } from './api/websocket-server';

const logger = createLogger('admin-dashboard');

const app = express();
const port = process.env.PORT || SERVICE_PORTS.ADMIN_DASHBOARD;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
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

// Static files (for React build)
app.use(express.static(path.join(__dirname, '../../build')));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// API Routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', express.Router().get('/', (_req, res) => {
  res.json({ message: 'Admin Dashboard API' });
}));

// Serve React app for all other routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../build/index.html'));
});

// Global error handler
app.use(errorHandler);

// Initialize GraphQL and WebSocket servers
const initializeServers = async () => {
  try {
    // Create GraphQL server with subscriptions
    const { httpServer, apolloServer } = await createGraphQLServer(app);

    // Create WebSocket server for real-time updates
    const wsServer = new DashboardWebSocketServer(httpServer);

    // Start HTTP server
    httpServer.listen(port, () => {
      logger.info(`Admin Dashboard listening on port ${port}`);
      logger.info(`GraphQL endpoint: http://localhost:${port}/graphql`);
      logger.info(`WebSocket endpoint: ws://localhost:${port}/socket.io`);
      logger.info(`Dashboard UI: http://localhost:${port}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      try {
        await apolloServer.stop();
        httpServer.close(() => {
          logger.info('Process terminated');
          process.exit(0);
        });
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return { httpServer, apolloServer, wsServer };
  } catch (error) {
    logger.error('Failed to initialize servers:', error);
    process.exit(1);
  }
};

// Start the application
initializeServers().catch((error) => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});

export default app;