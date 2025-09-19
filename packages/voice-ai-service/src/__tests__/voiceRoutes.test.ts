import request from 'supertest';
import express from 'express';
import voiceRouter from '../routes/voice';

// Mock the services
jest.mock('../services/audio/audioProcessingService');
jest.mock('../services/voice/voiceConversationService');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/voice', voiceRouter);

describe('Voice Routes', () => {
  describe('POST /voice/webhook/twilio/call', () => {
    it('should handle incoming call webhook', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('Capitol Eye Care');
      expect(response.text).toContain('<Gather');
    });

    it('should handle missing call parameters gracefully', async () => {
      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('Capitol Eye Care');
    });
  });

  describe('POST /voice/webhook/twilio/process-speech', () => {
    it('should process speech input successfully', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        SpeechResult: 'Are you open?',
        Confidence: '0.9'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/process-speech')
        .send(twilioPayload)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('<Say>');
    });

    it('should handle low confidence speech input', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        SpeechResult: 'mumbled words',
        Confidence: '0.3'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/process-speech')
        .send(twilioPayload)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('didn\'t understand');
      expect(response.text).toContain('<Gather');
    });

    it('should handle empty speech input', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        SpeechResult: '',
        Confidence: '0.0'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/process-speech')
        .send(twilioPayload)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('didn\'t understand');
    });

    it('should provide graceful error handling', async () => {
      // Mock the voice service to throw an error
      const mockVoiceService = require('../services/voice/voiceConversationService');
      mockVoiceService.VoiceConversationService.mockImplementation(() => ({
        processInput: jest.fn().mockRejectedValue(new Error('Service error'))
      }));

      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        SpeechResult: 'Are you open?',
        Confidence: '0.9'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/process-speech')
        .send(twilioPayload)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/xml/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('technical difficulty');
    });
  });

  describe('GET /voice/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/voice/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'voice-ai-service');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body.dependencies).toHaveProperty('twilio');
      expect(response.body.dependencies).toHaveProperty('openai');
      expect(response.body.dependencies).toHaveProperty('elevenlabs');
    });
  });

  describe('TwiML Response Validation', () => {
    it('should generate valid TwiML with proper structure', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      // Validate TwiML structure
      expect(response.text).toMatch(/<\?xml version="1.0" encoding="UTF-8"\?>/);
      expect(response.text).toContain('<Response>');
      expect(response.text).toContain('</Response>');
      expect(response.text).toContain('<Say');
      expect(response.text).toContain('voice="alice"');
      expect(response.text).toContain('rate="85%"');
    });

    it('should include appropriate Gather configuration', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      // Validate Gather configuration
      expect(response.text).toContain('<Gather');
      expect(response.text).toContain('input="speech"');
      expect(response.text).toContain('timeout="5"');
      expect(response.text).toContain('speechTimeout="auto"');
      expect(response.text).toContain('action="/voice/webhook/twilio/process-speech"');
      expect(response.text).toContain('method="POST"');
    });
  });

  describe('Patient-Friendly Features', () => {
    it('should use slower speech rate for patients', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      expect(response.text).toContain('rate="85%"');
    });

    it('should use appropriate voice for patients', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      expect(response.text).toContain('voice="alice"');
    });

    it('should provide patient and clear messaging', async () => {
      const twilioPayload = {
        CallSid: 'CA1234567890abcdef',
        From: '+12345551234',
        To: '+12345556789'
      };

      const response = await request(app)
        .post('/voice/webhook/twilio/call')
        .send(twilioPayload)
        .expect(200);

      expect(response.text).toContain('Capitol Eye Care');
      expect(response.text).toContain('virtual assistant');
      expect(response.text).toContain('How may I help you');
    });
  });
});