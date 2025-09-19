import express from 'express';
// import { HealthCheckResponse } from '@ai-voice-agent/shared-utils';

// Temporary implementation until shared-utils is available
interface HealthCheckResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
}

const router = express.Router();

router.get('/', (_req, res) => {
  const uptime = process.uptime();
  
  const healthCheck: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'audit-service',
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.round(uptime)
  };

  res.status(200).json(healthCheck);
});

export { router as healthRouter };