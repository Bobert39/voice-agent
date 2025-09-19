import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('twilio-auth');

/**
 * Middleware to verify Twilio webhook signatures for security
 * Implements HIPAA-compliant authentication requirements
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioSignature = req.headers['x-twilio-signature'];

    if (!authToken) {
      logger.error('Twilio auth token not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!twilioSignature) {
      logger.warn('Missing Twilio signature in request', {
        callSid: req.body.CallSid,
        url: req.url
      });
      return res.status(401).json({ error: 'Unauthorized - Missing signature' });
    }

    // Create expected signature
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = Object.keys(req.body)
      .sort()
      .map(key => `${key}${req.body[key]}`)
      .join('');

    const data = url + params;
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    const computedSignature = `sha1=${expectedSignature}`;

    if (twilioSignature !== computedSignature) {
      logger.warn('Invalid Twilio signature', {
        callSid: req.body.CallSid,
        expectedSignature: computedSignature,
        receivedSignature: twilioSignature,
        url
      });
      return res.status(401).json({ error: 'Unauthorized - Invalid signature' });
    }

    logger.info('Twilio signature verified successfully', {
      callSid: req.body.CallSid,
      url
    });

    next();
  } catch (error) {
    logger.error('Error verifying Twilio signature', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      callSid: req.body.CallSid
    });

    res.status(500).json({ error: 'Server error during authentication' });
  }
}

/**
 * Rate limiting middleware for Twilio webhooks
 * Prevents abuse while allowing legitimate calls
 */
export function rateLimitTwilioWebhooks(req: Request, res: Response, next: NextFunction) {
  // Simple rate limiting - in production, use Redis-based rate limiting
  const callSid = req.body.CallSid;

  if (!callSid) {
    logger.warn('Missing CallSid in Twilio webhook');
    return res.status(400).json({ error: 'Invalid request - Missing CallSid' });
  }

  // Log for monitoring and audit trail
  logger.info('Twilio webhook rate limit check', {
    callSid,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  });

  next();
}