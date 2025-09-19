/**
 * NLU Service Entry Point
 * Natural Language Understanding for healthcare voice agent
 */

import express from 'express';
import dotenv from 'dotenv';
import { NLUService } from './services/nlu-service';
import { NLURequest, NLUResponse, NLUServiceConfig } from './types';
import { logger } from './utils/logger';
import { CONFIDENCE_THRESHOLDS } from './config/intents.config';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'nlu-service',
    timestamp: new Date().toISOString()
  });
});

// Initialize NLU service
const config: NLUServiceConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4-0125-preview',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  timeout: parseInt(process.env.TIMEOUT || '5000'),
  confidenceThresholds: CONFIDENCE_THRESHOLDS,
  contextTimeout: parseInt(process.env.CONTEXT_TIMEOUT || '900'),
  maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY || '10')
};

// Validate configuration
if (!config.openaiApiKey) {
  logger.error('OPENAI_API_KEY is required');
  process.exit(1);
}

const nluService = new NLUService({
  openaiApiKey: config.openaiApiKey,
  openaiModel: config.openaiModel,
  redisUrl: config.redisUrl,
  confidenceThresholds: config.confidenceThresholds
});

/**
 * Process utterance endpoint
 */
app.post('/api/nlu/process', async (req, res) => {
  const startTime = Date.now();

  try {
    const request: NLURequest = {
      sessionId: req.body.sessionId || generateSessionId(),
      utterance: req.body.utterance,
      patientVerified: req.body.patientVerified || false,
      patientId: req.body.patientId,
      contextEnabled: req.body.contextEnabled ?? true // Default to context-aware
    };

    // Validate required fields
    if (!request.utterance) {
      return res.status(400).json({
        success: false,
        error: 'Utterance is required'
      });
    }

    // Process utterance
    const response: NLUResponse = await nluService.processUtterance(request);

    // Add processing metrics
    const processingTime = Date.now() - startTime;
    logger.info('NLU request processed', {
      sessionId: request.sessionId,
      processingTime,
      intent: response.result?.intent.category,
      confidence: response.result?.intent.confidence,
      escalationRequired: response.escalationRequired
    });

    res.json(response);

  } catch (error) {
    logger.error('NLU processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.body.sessionId
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      escalationRequired: true
    });
  }
});

/**
 * Get context endpoint
 */
app.get('/api/nlu/context/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // This would integrate with context manager
    // For now, return placeholder
    res.json({
      success: true,
      context: {
        sessionId,
        conversationHistory: [],
        patientVerified: false
      }
    });

  } catch (error) {
    logger.error('Context retrieval error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve context'
    });
  }
});

/**
 * Clear context endpoint
 */
app.delete('/api/nlu/context/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // This would clear context from Redis
    logger.info('Context cleared', { sessionId });

    res.json({
      success: true,
      message: 'Context cleared successfully'
    });

  } catch (error) {
    logger.error('Context clear error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to clear context'
    });
  }
});

/**
 * Intent training endpoint (for future ML improvements)
 */
app.post('/api/nlu/train', async (req, res) => {
  try {
    const { utterance, intent, entities, correct } = req.body;

    // Log training data for future ML model improvements
    logger.info('Training data received', {
      utterance: utterance.substring(0, 100), // Truncate for logging
      intent,
      entitiesCount: entities?.length || 0,
      correct
    });

    res.json({
      success: true,
      message: 'Training data recorded'
    });

  } catch (error) {
    logger.error('Training endpoint error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to record training data'
    });
  }
});

/**
 * Metrics endpoint
 */
app.get('/api/nlu/metrics', async (req, res) => {
  try {
    // This would return real metrics from monitoring
    res.json({
      success: true,
      metrics: {
        totalRequests: 0,
        averageConfidence: 0,
        escalationRate: 0,
        averageProcessingTime: 0,
        activeContexts: 0
      }
    });

  } catch (error) {
    logger.error('Metrics endpoint error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

/**
 * Generate session ID
 */
function generateSessionId(): string {
  return `nlu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred',
    escalationRequired: true
  });
});

// Start server
const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  logger.info(`NLU Service started on port ${PORT}`);
  logger.info('Configuration', {
    model: config.openaiModel,
    contextTimeout: config.contextTimeout
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;