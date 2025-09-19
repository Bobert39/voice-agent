/**
 * Natural Language Understanding Service
 * Core service for intent recognition and entity extraction
 */

import OpenAI from 'openai';
import {
  NLURequest,
  NLUResponse,
  NLUResult,
  IntentResult,
  IntentCategory,
  ConfidenceLevel,
  ExtractedEntity,
  NLUError,
  ConversationContext
} from '../types';
import {
  INTENT_TRAINING_DATA,
  CONFIDENCE_THRESHOLDS,
  ESCALATION_TRIGGERS
} from '../config/intents.config';
import { EntityExtractionService } from './entity-extraction-service';
import { ConfidenceScoringService } from './confidence-scoring-service';
import { ContextManager } from './context-manager';
import { logger } from '../utils/logger';

export class NLUService {
  private openai: OpenAI;
  private entityExtractor: EntityExtractionService;
  private confidenceScorer: ConfidenceScoringService;
  private contextManager: ContextManager;

  constructor(
    private config: {
      openaiApiKey: string;
      openaiModel: string;
      redisUrl: string;
      confidenceThresholds: typeof CONFIDENCE_THRESHOLDS;
    }
  ) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    this.entityExtractor = new EntityExtractionService();
    this.confidenceScorer = new ConfidenceScoringService(config.confidenceThresholds);
    this.contextManager = new ContextManager(config.redisUrl);
  }

  /**
   * Process natural language utterance
   */
  async processUtterance(request: NLURequest): Promise<NLUResponse> {
    const startTime = Date.now();

    try {
      // Process the utterance
      const processedUtterance = request.utterance;

      // Get conversation context if enabled
      let context: ConversationContext | undefined;
      if (request.contextEnabled) {
        context = await this.contextManager.getContext(request.sessionId);
      }

      // Perform intent recognition with GPT-4
      const intentResult = await this.recognizeIntent(
        processedUtterance,
        context
      );

      // Extract entities from utterance
      const entities = await this.entityExtractor.extractEntities(
        processedUtterance,
        intentResult.category
      );

      // Calculate confidence score
      const confidenceScore = this.confidenceScorer.calculateScore(
        intentResult,
        entities,
        context
      );

      // Update intent confidence
      intentResult.confidence = confidenceScore.score;
      intentResult.confidenceLevel = confidenceScore.level;
      intentResult.requiresEscalation = confidenceScore.requiresEscalation;

      // Check for escalation triggers
      const needsEscalation = this.checkEscalationTriggers(
        processedUtterance,
        intentResult
      );

      // Create NLU result
      const result: NLUResult = {
        sessionId: request.sessionId,
        utterance: this.sanitizeUtterance(processedUtterance), // Remove PHI
        intent: intentResult,
        entities,
        context,
        processingTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // Update conversation context
      if (request.contextEnabled) {
        await this.contextManager.updateContext(
          request.sessionId,
          intentResult.category,
          entities,
          request.patientVerified,
          request.patientId
        );
      }

      // Log for HIPAA audit trail
      await this.auditLog(result, request);

      return {
        success: true,
        result,
        escalationRequired: needsEscalation || intentResult.requiresEscalation,
        suggestedResponse: await this.generateSuggestedResponse(result)
      };

    } catch (error) {
      logger.error('NLU processing error', { error, sessionId: request.sessionId });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        escalationRequired: true
      };
    }
  }

  /**
   * Recognize intent using GPT-4
   */
  private async recognizeIntent(
    utterance: string,
    context?: ConversationContext
  ): Promise<IntentResult> {
    try {
      // Build context-aware prompt
      const prompt = this.buildIntentPrompt(utterance, context);

      const completion = await this.openai.chat.completions.create({
        model: this.config.openaiModel,
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier for a healthcare optometry practice voice system.
                     Classify the user's intent into one of these categories:
                     ${Object.values(IntentCategory).join(', ')}.
                     Also provide a specific intent name and confidence score (0-1).
                     Consider the conversation context if provided.
                     Respond in JSON format: {"category": "", "intent": "", "confidence": 0.0}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
        response_format: { type: "json_object" }
      });

      const response = JSON.parse(completion.choices[0].message.content || '{}');

      // Map to confidence level
      const confidenceLevel = this.getConfidenceLevel(response.confidence);

      return {
        category: response.category || IntentCategory.UNKNOWN,
        intent: response.intent || 'unknown',
        confidence: response.confidence || 0,
        confidenceLevel,
        requiresEscalation: confidenceLevel === ConfidenceLevel.LOW,
        suggestedAction: this.getSuggestedAction(response.category)
      };

    } catch (error) {
      logger.error('Intent recognition failed', { error, utterance });

      // Fallback to rule-based classification
      return this.fallbackIntentClassification(utterance);
    }
  }

  /**
   * Build context-aware prompt for GPT-4
   */
  private buildIntentPrompt(utterance: string, context?: ConversationContext): string {
    let prompt = `Utterance: "${utterance}"`;

    if (context && context.conversationHistory.length > 0) {
      const recentHistory = context.conversationHistory.slice(-3);
      prompt += `\n\nRecent conversation context:`;
      recentHistory.forEach(turn => {
        prompt += `\n- Previous intent: ${turn.intent}`;
      });

      if (context.currentTopic) {
        prompt += `\nCurrent topic: ${context.currentTopic}`;
      }
    }

    return prompt;
  }

  /**
   * Fallback rule-based intent classification
   */
  private fallbackIntentClassification(utterance: string): IntentResult {
    const lowerUtterance = utterance.toLowerCase();

    // Check each intent category's training examples
    for (const trainingData of INTENT_TRAINING_DATA) {
      for (const example of trainingData.examples) {
        if (this.similarityScore(lowerUtterance, example.toLowerCase()) > 0.7) {
          return {
            category: trainingData.category,
            intent: `${trainingData.category}_fallback`,
            confidence: 0.6,
            confidenceLevel: ConfidenceLevel.MEDIUM,
            requiresEscalation: false
          };
        }
      }
    }

    return {
      category: IntentCategory.UNKNOWN,
      intent: 'unknown',
      confidence: 0.3,
      confidenceLevel: ConfidenceLevel.LOW,
      requiresEscalation: true
    };
  }

  /**
   * Calculate similarity score between two strings
   */
  private similarityScore(str1: string, str2: string): number {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');

    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * Get confidence level based on score
   */
  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score > this.config.confidenceThresholds.high) {
      return ConfidenceLevel.HIGH;
    } else if (score > this.config.confidenceThresholds.medium) {
      return ConfidenceLevel.MEDIUM;
    } else {
      return ConfidenceLevel.LOW;
    }
  }

  /**
   * Get suggested action based on intent category
   */
  private getSuggestedAction(category: IntentCategory): string {
    const actions: Record<IntentCategory, string> = {
      [IntentCategory.APPOINTMENT]: 'Route to scheduling service',
      [IntentCategory.PRACTICE_INFO]: 'Provide practice information',
      [IntentCategory.INSURANCE]: 'Check insurance coverage',
      [IntentCategory.PRESCRIPTION]: 'Verify prescription status',
      [IntentCategory.EMERGENCY]: 'Escalate to medical staff immediately',
      [IntentCategory.GENERAL]: 'Provide general assistance',
      [IntentCategory.UNKNOWN]: 'Request clarification or escalate'
    };

    return actions[category] || 'Process request';
  }

  /**
   * Check for escalation triggers
   */
  private checkEscalationTriggers(utterance: string, intent: IntentResult): boolean {
    const lowerUtterance = utterance.toLowerCase();

    // Check for emergency keywords
    for (const keyword of ESCALATION_TRIGGERS.keywords) {
      if (lowerUtterance.includes(keyword)) {
        logger.info('Escalation triggered by keyword', { keyword, utterance });
        return true;
      }
    }

    // Emergency intent always escalates
    if (intent.category === IntentCategory.EMERGENCY) {
      return true;
    }

    // Low confidence with sensitive intent
    if (intent.confidenceLevel === ConfidenceLevel.LOW &&
        (intent.category === IntentCategory.PRESCRIPTION ||
         intent.category === IntentCategory.INSURANCE)) {
      return true;
    }

    return false;
  }

  /**
   * Sanitize utterance to remove PHI
   */
  private sanitizeUtterance(utterance: string): string {
    // Remove potential PHI patterns
    let sanitized = utterance;

    // Remove phone numbers
    sanitized = sanitized.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');

    // Remove dates of birth
    sanitized = sanitized.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[DATE]');

    // Remove SSN patterns
    sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

    // Remove email addresses
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');

    return sanitized;
  }

  /**
   * Generate suggested response based on NLU result
   */
  private async generateSuggestedResponse(result: NLUResult): Promise<string> {
    // This would integrate with response generation service
    // For now, return basic response based on intent

    const responses: Record<IntentCategory, string> = {
      [IntentCategory.APPOINTMENT]: 'I can help you with scheduling. Let me check our availability.',
      [IntentCategory.PRACTICE_INFO]: 'I\'d be happy to provide information about our practice.',
      [IntentCategory.INSURANCE]: 'I can help you with insurance questions.',
      [IntentCategory.PRESCRIPTION]: 'I\'ll help you with your prescription needs.',
      [IntentCategory.EMERGENCY]: 'This sounds urgent. Let me connect you with our medical staff right away.',
      [IntentCategory.GENERAL]: 'How can I assist you today?',
      [IntentCategory.UNKNOWN]: 'I\'m not quite sure I understood. Could you please rephrase your question?'
    };

    return responses[result.intent.category] || 'How can I help you?';
  }

  /**
   * Log for HIPAA audit trail
   */
  private async auditLog(result: NLUResult, request: NLURequest): Promise<void> {
    const auditEntry = {
      timestamp: result.timestamp,
      sessionId: result.sessionId,
      patientId: request.patientId, // Only if verified
      intentCategory: result.intent.category,
      confidence: result.intent.confidence,
      escalated: result.intent.requiresEscalation,
      processingTime: result.processingTime,
      success: true
    };

    logger.info('NLU audit log', auditEntry);
    // Would also write to secure audit storage
  }
}