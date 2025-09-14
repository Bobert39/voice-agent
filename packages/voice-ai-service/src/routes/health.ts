import express from 'express';
import { HealthCheckResponse } from '@ai-voice-agent/shared-utils';

const router = express.Router();

router.get('/', (_req, res) => {
  const uptime = process.uptime();
  
  const healthCheck: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'voice-ai-service',
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.round(uptime)
  };

  res.status(200).json(healthCheck);
});

export { router as healthRouter };