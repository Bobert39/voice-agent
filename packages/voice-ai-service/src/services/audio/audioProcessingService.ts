import OpenAI from 'openai';
import { ElevenLabs } from 'elevenlabs';
import { createLogger } from '@ai-voice-agent/shared-utils';
import fs from 'fs';

const logger = createLogger('audio-processing-service');

export interface AudioProcessingConfig {
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
}

export class AudioProcessingService {
  private openai: OpenAI;
  private elevenlabs: any;
  private voiceId: string;

  constructor(config?: AudioProcessingConfig) {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config?.openaiApiKey || process.env.OPENAI_API_KEY
    });

    // Initialize ElevenLabs client
    this.elevenlabs = ElevenLabs;

    // Use elderly-friendly voice profile
    this.voiceId = config?.elevenLabsVoiceId || process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam voice (clear, professional)
  }

  /**
   * Convert speech to text using OpenAI Whisper
   * Optimized for elderly speech patterns and medical terminology
   */
  async speechToText(audioBuffer: Buffer, contentType: string = 'audio/wav'): Promise<TranscriptionResult> {
    try {
      logger.info('Starting speech-to-text transcription', {
        audioSize: audioBuffer.length,
        contentType
      });

      // Create a temporary file for the audio
      const tempFilePath = `/tmp/audio_${Date.now()}.wav`;
      fs.writeFileSync(tempFilePath, audioBuffer);

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: 'en',
        prompt: 'This is a phone call to an optometry practice. Common topics include appointments, office hours, insurance, and eye care services.',
        temperature: 0.2 // Lower temperature for more consistent results
      });

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      logger.info('Speech-to-text completed', {
        text: transcription.text,
        textLength: transcription.text.length
      });

      return {
        text: transcription.text,
        confidence: 0.9, // Whisper doesn't provide confidence scores directly
        language: 'en'
      };

    } catch (error) {
      logger.error('Speech-to-text conversion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      throw new Error(`Speech-to-text conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert text to speech using ElevenLabs
   * Optimized for elderly patients with clear, slower speech
   */
  async textToSpeech(text: string, options?: { 
    stability?: number;
    similarityBoost?: number;
    style?: number;
    speakerBoost?: boolean;
  }): Promise<TTSResult> {
    try {
      logger.info('Starting text-to-speech conversion', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        textLength: text.length,
        voiceId: this.voiceId
      });

      const audioStream = await this.elevenlabs.generate({
        voice: this.voiceId,
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: options?.stability || 0.8,
          similarity_boost: options?.similarityBoost || 0.7,
          style: options?.style || 0.3,
          use_speaker_boost: options?.speakerBoost || true
        }
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      logger.info('Text-to-speech completed', {
        audioSize: audioBuffer.length
      });

      return {
        audioBuffer,
        contentType: 'audio/mpeg'
      };

    } catch (error) {
      logger.error('Text-to-speech conversion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        text: text.substring(0, 50)
      });

      throw new Error(`Text-to-speech conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fallback TTS using system capabilities when ElevenLabs fails
   */
  async fallbackTextToSpeech(text: string): Promise<TTSResult> {
    logger.warn('Using fallback TTS system', { text: text.substring(0, 50) });
    
    // This would typically use a simpler TTS system or pre-recorded messages
    // For now, return an empty buffer to indicate fallback is needed
    return {
      audioBuffer: Buffer.alloc(0),
      contentType: 'audio/wav'
    };
  }

  /**
   * Process audio from Twilio webhook format
   * Converts μ-law audio to format suitable for Whisper
   */
  async processTwilioAudio(audioUrl: string): Promise<Buffer> {
    try {
      logger.info('Processing Twilio audio', { audioUrl });

      // Note: In a real implementation, you would:
      // 1. Download the audio from Twilio's URL
      // 2. Convert from μ-law to WAV format
      // 3. Return the converted buffer
      
      // For now, return placeholder
      throw new Error('Twilio audio processing not yet implemented');

    } catch (error) {
      logger.error('Twilio audio processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        audioUrl
      });
      throw error;
    }
  }

  /**
   * Validate audio format and size
   */
  async validateAudio(audioBuffer: Buffer): Promise<boolean> {
    try {
      // Check file size (limit to 25MB as per OpenAI limits)
      if (audioBuffer.length > 25 * 1024 * 1024) {
        logger.warn('Audio file too large', { size: audioBuffer.length });
        return false;
      }

      // Check if buffer is not empty
      if (audioBuffer.length === 0) {
        logger.warn('Empty audio buffer');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Audio validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Health check for audio services
   */
  async healthCheck(): Promise<{ openai: boolean; elevenlabs: boolean }> {
    const results = {
      openai: false,
      elevenlabs: false
    };

    try {
      // Test OpenAI connection
      await this.openai.models.list();
      results.openai = true;
    } catch (error) {
      logger.error('OpenAI health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    try {
      // Test ElevenLabs connection
      await this.elevenlabs.voices.getAll();
      results.elevenlabs = true;
    } catch (error) {
      logger.error('ElevenLabs health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return results;
  }
}

export default AudioProcessingService;