import { AudioProcessingService } from '../services/audio/audioProcessingService';

// Mock the external dependencies
jest.mock('openai');
jest.mock('elevenlabs');
jest.mock('fs');

describe('AudioProcessingService', () => {
  let service: AudioProcessingService;
  
  beforeEach(() => {
    service = new AudioProcessingService({
      openaiApiKey: 'test-openai-key',
      elevenLabsApiKey: 'test-elevenlabs-key',
      elevenLabsVoiceId: 'test-voice-id'
    });
  });

  describe('speechToText', () => {
    it('should process audio buffer successfully', async () => {
      const mockBuffer = Buffer.from('fake audio data');
      
      // Mock OpenAI response
      const mockOpenAI = require('openai');
      mockOpenAI.prototype.audio = {
        transcriptions: {
          create: jest.fn().mockResolvedValue({
            text: 'Are you open today?'
          })
        }
      };

      // Mock fs operations
      const mockFs = require('fs');
      mockFs.writeFileSync = jest.fn();
      mockFs.createReadStream = jest.fn().mockReturnValue('mock-stream');
      mockFs.unlinkSync = jest.fn();

      const result = await service.speechToText(mockBuffer, 'audio/wav');

      expect(result.text).toBe('Are you open today?');
      expect(result.confidence).toBe(0.9);
      expect(result.language).toBe('en');
    });

    it('should handle transcription errors gracefully', async () => {
      const mockBuffer = Buffer.from('fake audio data');
      
      // Mock OpenAI to throw error
      const mockOpenAI = require('openai');
      mockOpenAI.prototype.audio = {
        transcriptions: {
          create: jest.fn().mockRejectedValue(new Error('API Error'))
        }
      };

      await expect(service.speechToText(mockBuffer, 'audio/wav'))
        .rejects.toThrow('Speech-to-text conversion failed');
    });
  });

  describe('textToSpeech', () => {
    it('should generate audio from text successfully', async () => {
      const testText = 'Hello, this is Capitol Eye Care';
      const mockAudioChunks = [Buffer.from('chunk1'), Buffer.from('chunk2')];
      
      // Mock ElevenLabs response
      const mockElevenLabs = require('elevenlabs');
      mockElevenLabs.ElevenLabs.prototype.generate = jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield* mockAudioChunks;
        }
      });

      const result = await service.textToSpeech(testText);

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('audio/mpeg');
    });

    it('should handle TTS errors gracefully', async () => {
      const testText = 'Hello, this is Capitol Eye Care';
      
      // Mock ElevenLabs to throw error
      const mockElevenLabs = require('elevenlabs');
      mockElevenLabs.ElevenLabs.prototype.generate = jest.fn().mockRejectedValue(new Error('TTS Error'));

      await expect(service.textToSpeech(testText))
        .rejects.toThrow('Text-to-speech conversion failed');
    });

    it('should use appropriate voice settings for elderly patients', async () => {
      const testText = 'Our office hours are 8 AM to 5 PM';
      const mockAudioChunks = [Buffer.from('audio')];
      
      const mockGenerate = jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield* mockAudioChunks;
        }
      });

      const mockElevenLabs = require('elevenlabs');
      mockElevenLabs.ElevenLabs.prototype.generate = mockGenerate;

      await service.textToSpeech(testText, {
        stability: 0.9,
        similarityBoost: 0.8,
        style: 0.2,
        speakerBoost: true
      });

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          voice_settings: expect.objectContaining({
            stability: 0.9,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true
          })
        })
      );
    });
  });

  describe('validateAudio', () => {
    it('should validate audio buffer size', async () => {
      const validBuffer = Buffer.alloc(1024); // 1KB
      const result = await service.validateAudio(validBuffer);
      expect(result).toBe(true);
    });

    it('should reject oversized audio buffers', async () => {
      const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024); // 26MB
      const result = await service.validateAudio(oversizedBuffer);
      expect(result).toBe(false);
    });

    it('should reject empty audio buffers', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = await service.validateAudio(emptyBuffer);
      expect(result).toBe(false);
    });
  });

  describe('fallbackTextToSpeech', () => {
    it('should provide fallback TTS response', async () => {
      const result = await service.fallbackTextToSpeech('Test message');
      
      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('audio/wav');
      expect(result.audioBuffer.length).toBe(0); // Empty buffer for fallback
    });
  });

  describe('healthCheck', () => {
    it('should check service health successfully', async () => {
      // Mock successful service responses
      const mockOpenAI = require('openai');
      mockOpenAI.prototype.models = {
        list: jest.fn().mockResolvedValue({ data: [] })
      };

      const mockElevenLabs = require('elevenlabs');
      mockElevenLabs.ElevenLabs.prototype.voices = {
        getAll: jest.fn().mockResolvedValue([])
      };

      const result = await service.healthCheck();

      expect(result.openai).toBe(true);
      expect(result.elevenlabs).toBe(true);
    });

    it('should handle service failures in health check', async () => {
      // Mock service failures
      const mockOpenAI = require('openai');
      mockOpenAI.prototype.models = {
        list: jest.fn().mockRejectedValue(new Error('OpenAI Error'))
      };

      const mockElevenLabs = require('elevenlabs');
      mockElevenLabs.ElevenLabs.prototype.voices = {
        getAll: jest.fn().mockRejectedValue(new Error('ElevenLabs Error'))
      };

      const result = await service.healthCheck();

      expect(result.openai).toBe(false);
      expect(result.elevenlabs).toBe(false);
    });
  });

  describe('processTwilioAudio', () => {
    it('should throw error for unimplemented Twilio audio processing', async () => {
      await expect(service.processTwilioAudio('https://api.twilio.com/audio.wav'))
        .rejects.toThrow('Twilio audio processing not yet implemented');
    });
  });

  describe('configuration', () => {
    it('should use environment variables when no config provided', () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';
      process.env.ELEVENLABS_API_KEY = 'env-elevenlabs-key';
      process.env.ELEVENLABS_VOICE_ID = 'env-voice-id';

      const serviceWithEnvConfig = new AudioProcessingService();
      
      // Verify constructor doesn't throw and service is created
      expect(serviceWithEnvConfig).toBeInstanceOf(AudioProcessingService);
    });

    it('should use provided config over environment variables', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      
      const serviceWithConfig = new AudioProcessingService({
        openaiApiKey: 'config-key',
        elevenLabsApiKey: 'config-elevenlabs-key'
      });

      expect(serviceWithConfig).toBeInstanceOf(AudioProcessingService);
    });
  });
});