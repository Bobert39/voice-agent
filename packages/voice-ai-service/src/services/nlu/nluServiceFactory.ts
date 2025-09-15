import { NaturalLanguageService } from './naturalLanguageService';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('nlu-service-factory');

export interface NLUServiceConfig {
  openai: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  confidence?: {
    threshold?: number;
    highTier?: number;
    mediumTier?: number;
  };
  fallback?: {
    intent?: string;
    maxRetries?: number;
  };
  elderly?: {
    patienceModifier?: number;
    clarificationThreshold?: number;
    repetitionTolerance?: number;
  };
}

export class NLUServiceFactory {
  private static instance: NaturalLanguageService | null = null;
  private static config: NLUServiceConfig | null = null;

  /**
   * Create or get singleton NLU service instance
   */
  static create(config: NLUServiceConfig): NaturalLanguageService {
    // Validate required configuration
    if (!config.openai?.apiKey) {
      throw new Error('OpenAI API key is required for NLU service');
    }

    // Use singleton pattern for efficiency
    if (this.instance && this.configEquals(config)) {
      return this.instance;
    }

    logger.info('Creating new NLU service instance', {
      model: config.openai.model || 'gpt-4-turbo-preview',
      confidenceThreshold: config.confidence?.threshold || 0.7
    });

    // Build complete configuration with defaults
    const fullConfig = this.buildConfiguration(config);

    // Create new instance
    this.instance = new NaturalLanguageService(fullConfig);
    this.config = config;

    return this.instance;
  }

  /**
   * Create NLU service for Capitol Eye Care with optimized defaults
   */
  static createForCapitolEyeCare(openaiApiKey: string): NaturalLanguageService {
    const config: NLUServiceConfig = {
      openai: {
        apiKey: openaiApiKey,
        model: 'gpt-4-turbo-preview', // Best for medical context understanding
        temperature: 0.3, // Lower temperature for consistent medical intent recognition
        maxTokens: 500 // Sufficient for detailed intent analysis
      },
      confidence: {
        threshold: 0.7, // Conservative threshold for medical accuracy
        highTier: 0.85, // High confidence for direct responses
        mediumTier: 0.6 // Medium confidence requires clarification
      },
      fallback: {
        intent: 'clarification_request', // Safe fallback for medical context
        maxRetries: 2
      },
      elderly: {
        patienceModifier: 1.5, // Extra patience for elderly patients
        clarificationThreshold: 0.5, // Lower threshold for asking clarification
        repetitionTolerance: 3 // Allow more repetition before flagging confusion
      }
    };

    return this.create(config);
  }

  /**
   * Create NLU service for development/testing
   */
  static createForTesting(openaiApiKey: string): NaturalLanguageService {
    const config: NLUServiceConfig = {
      openai: {
        apiKey: openaiApiKey,
        model: 'gpt-4-turbo-preview',
        temperature: 0.1, // Very low temperature for consistent testing
        maxTokens: 300
      },
      confidence: {
        threshold: 0.6, // Lower threshold for testing
        highTier: 0.8,
        mediumTier: 0.5
      },
      fallback: {
        intent: 'unknown',
        maxRetries: 1
      },
      elderly: {
        patienceModifier: 1.0,
        clarificationThreshold: 0.4,
        repetitionTolerance: 2
      }
    };

    return this.create(config);
  }

  /**
   * Get current service instance (if exists)
   */
  static getInstance(): NaturalLanguageService | null {
    return this.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
    this.config = null;
    logger.debug('NLU service factory reset');
  }

  /**
   * Validate service health
   */
  static async validateService(service: NaturalLanguageService): Promise<boolean> {
    try {
      // Test with simple utterance
      const testResult = await service.processUtterance(
        "Hello, I need to schedule an appointment",
        {
          conversationId: 'test',
          turnCount: 1,
          recentTopics: []
        }
      );

      // Check if we got a reasonable result
      const isValid = testResult.intent !== 'unknown' &&
                     testResult.confidence > 0.1 &&
                     testResult.processing.processingTime > 0;

      logger.info('NLU service validation result', {
        isValid,
        intent: testResult.intent,
        confidence: testResult.confidence,
        processingTime: testResult.processing.processingTime
      });

      return isValid;

    } catch (error) {
      logger.error('NLU service validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private static buildConfiguration(config: NLUServiceConfig) {
    return {
      openai: {
        apiKey: config.openai.apiKey,
        model: config.openai.model || 'gpt-4-turbo-preview',
        temperature: config.openai.temperature ?? 0.3,
        maxTokens: config.openai.maxTokens || 500
      },
      confidence: {
        threshold: config.confidence?.threshold ?? 0.7,
        highTier: config.confidence?.highTier ?? 0.85,
        mediumTier: config.confidence?.mediumTier ?? 0.6
      },
      fallback: {
        intent: config.fallback?.intent || 'clarification_request',
        maxRetries: config.fallback?.maxRetries || 2
      },
      elderly: {
        patienceModifier: config.elderly?.patienceModifier ?? 1.5,
        clarificationThreshold: config.elderly?.clarificationThreshold ?? 0.5,
        repetitionTolerance: config.elderly?.repetitionTolerance ?? 3
      }
    };
  }

  private static configEquals(config: NLUServiceConfig): boolean {
    if (!this.config) return false;

    return this.config.openai.apiKey === config.openai.apiKey &&
           this.config.openai.model === config.openai.model &&
           this.config.openai.temperature === config.openai.temperature;
  }
}

/**
 * Convenience function to create NLU service for Capitol Eye Care
 */
export function createCapitolEyeCareNLU(openaiApiKey: string): NaturalLanguageService {
  return NLUServiceFactory.createForCapitolEyeCare(openaiApiKey);
}

/**
 * Convenience function to create NLU service for testing
 */
export function createTestingNLU(openaiApiKey: string): NaturalLanguageService {
  return NLUServiceFactory.createForTesting(openaiApiKey);
}