import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { logger } from '@ai-voice-agent/shared-utils';
import { AudioProcessingService } from '../services/audio/audioProcessingService';
import { VoiceConversationService } from '../services/voice/voiceConversationService';

const router = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Initialize services
const audioService = new AudioProcessingService();
const voiceConversationService = new VoiceConversationService();

/**
 * Twilio webhook endpoint for incoming calls
 * Handles the initial call setup and starts conversation flow
 */
router.post('/webhook/twilio/call', async (req: Request, res: Response) => {
  try {
    const { CallSid, From, To } = req.body;
    
    logger.info('Incoming call received', {
      callSid: CallSid,
      from: From,
      to: To,
      timestamp: new Date().toISOString()
    });

    const twiml = new VoiceResponse();
    
    // Create a welcoming message for elderly-friendly interaction
    const welcomeMessage = "Hello, thank you for calling Capitol Eye Care. I'm your virtual assistant. How may I help you today?";
    
    // Say the welcome message with slower speed for elderly patients
    twiml.say({
      voice: 'alice',
      rate: '85%'  // Slower rate for elderly patients
    }, welcomeMessage);

    // Start recording and gathering speech input
    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      speechTimeout: 'auto',
      action: '/voice/webhook/twilio/process-speech',
      method: 'POST'
    });

    // If no input detected, provide fallback
    twiml.say({
      voice: 'alice',
      rate: '85%'
    }, "I didn't hear anything. Let me transfer you to our staff. Please hold.");

    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Error handling Twilio webhook', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      callSid: req.body.CallSid
    });

    // Return a graceful error response
    const twiml = new VoiceResponse();
    twiml.say({
      voice: 'alice',
      rate: '85%'
    }, "I'm sorry, we're experiencing technical difficulties. Please call back in a few minutes or hold for our staff.");
    
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Process speech input from Twilio
 * Handles speech-to-text conversion and conversation logic
 */
router.post('/webhook/twilio/process-speech', async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult, Confidence } = req.body;
    
    logger.info('Processing speech input', {
      callSid: CallSid,
      speechResult: SpeechResult,
      confidence: Confidence
    });

    const twiml = new VoiceResponse();

    // Check if we have valid speech input
    if (!SpeechResult || parseFloat(Confidence) < 0.5) {
      logger.warn('Low confidence or no speech detected', {
        callSid: CallSid,
        confidence: Confidence
      });

      twiml.say({
        voice: 'alice',
        rate: '85%'
      }, "I'm sorry, I didn't understand that clearly. Could you please repeat your question?");

      // Give another chance to speak
      const gather = twiml.gather({
        input: 'speech',
        timeout: 5,
        speechTimeout: 'auto',
        action: '/voice/webhook/twilio/process-speech',
        method: 'POST'
      });

      twiml.hangup();
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    // Process the speech with voice conversation service
    const response = await voiceConversationService.processInput(SpeechResult, CallSid);

    // Generate appropriate TwiML response
    twiml.say({
      voice: 'alice',
      rate: '85%'
    }, response.message);

    // If conversation should continue, gather more input
    if (response.expectsMoreInput) {
      const gather = twiml.gather({
        input: 'speech',
        timeout: 5,
        speechTimeout: 'auto',
        action: '/voice/webhook/twilio/process-speech',
        method: 'POST'
      });
    } else {
      // End the call politely
      twiml.say({
        voice: 'alice',
        rate: '85%'
      }, "Thank you for calling Capitol Eye Care. Have a wonderful day!");
      twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Error processing speech', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      callSid: req.body.CallSid
    });

    const twiml = new VoiceResponse();
    twiml.say({
      voice: 'alice',
      rate: '85%'
    }, "I apologize for the technical difficulty. Let me transfer you to our staff.");
    
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Health check endpoint for voice service
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'voice-ai-service',
    timestamp: new Date().toISOString(),
    dependencies: {
      twilio: 'connected',
      openai: 'connected',
      elevenlabs: 'connected'
    }
  });
});

export default router;