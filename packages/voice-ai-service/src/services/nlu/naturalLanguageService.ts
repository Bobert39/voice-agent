import { IntentRecognitionService, IntentResult, ExtractedEntity } from './intentRecognitionService';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('natural-language-service');

export interface NLUResult {
  intent: string;
  confidence: number;
  entities: ExtractedEntity[];
  sentiment?: number;
  emotionalMarkers?: string[];
  context: {
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    topic: string;
    category: 'appointment' | 'information' | 'emergency' | 'billing' | 'general';
    requiresVerification: boolean;
    requiresFollowUp: boolean;
    suggestedResponses: string[];
  };
  conversationFlow: {
    nextPhase?: string;
    transitions: string[];
    contextPreserved: boolean;
  };
  processing: {
    processingTime: number;
    model: string;
    fallbackUsed: boolean;
    confidence_tier: 'high' | 'medium' | 'low';
  };
}

export interface ConversationContext {
  conversationId: string;
  previousIntent?: string;
  currentTopic?: string;
  verificationStatus?: 'unverified' | 'pending' | 'verified' | 'failed';
  emotionalState?: string;
  turnCount: number;
  recentTopics: string[];
  patientInfo?: {
    isElderly?: boolean;
    hearingDifficulty?: boolean;
    preferredPace?: 'slow' | 'normal' | 'fast';
  };
}

interface NLUConfig {
  openai: {
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  confidence: {
    threshold: number;
    highTier: number;
    mediumTier: number;
  };
  fallback: {
    intent: string;
    maxRetries: number;
  };
  elderly: {
    patienceModifier: number;
    clarificationThreshold: number;
    repetitionTolerance: number;
  };
}

export class NaturalLanguageService {
  private intentService: IntentRecognitionService;
  private config: NLUConfig;
  private processingMetrics: Map<string, number> = new Map();

  constructor(config: NLUConfig) {
    this.config = config;
    this.intentService = new IntentRecognitionService({
      openaiApiKey: config.openai.apiKey,
      model: config.openai.model,
      temperature: config.openai.temperature,
      maxTokens: config.openai.maxTokens,
      confidenceThreshold: config.confidence.threshold,
      fallbackIntent: config.fallback.intent
    });
  }

  /**
   * Process patient utterance with full NLU pipeline
   */
  async processUtterance(
    utterance: string, 
    conversationContext?: ConversationContext
  ): Promise<NLUResult> {
    const startTime = Date.now();
    let fallbackUsed = false;

    try {
      logger.debug('Processing patient utterance', {
        conversationId: conversationContext?.conversationId,
        utteranceLength: utterance.length,
        turnCount: conversationContext?.turnCount || 0
      });

      // Apply elderly-specific preprocessing
      const processedUtterance = this.preprocessForElderly(utterance, conversationContext);

      // Recognize intent with context
      const intentResult = await this.intentService.recognizeIntent(
        processedUtterance, 
        this.buildIntentContext(conversationContext)
      );

      // Check if fallback was used
      if (intentResult.intent === this.config.fallback.intent) {
        fallbackUsed = true;
      }

      // Enhance with conversation flow analysis
      const conversationFlow = await this.analyzeConversationFlow(
        intentResult, 
        conversationContext
      );

      // Build comprehensive result
      const result: NLUResult = {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        entities: intentResult.entities,
        sentiment: intentResult.sentiment,
        emotionalMarkers: intentResult.emotionalMarkers,
        context: {
          urgency: intentResult.context?.urgency || 'low',
          topic: intentResult.context?.topic || intentResult.intent,
          category: intentResult.context?.category || 'general',
          requiresVerification: intentResult.context?.requiresVerification || false,
          requiresFollowUp: intentResult.requiresFollowUp,
          suggestedResponses: this.adaptResponsesForElderly(
            intentResult.context?.suggestedResponses || [],
            conversationContext
          )
        },
        conversationFlow,
        processing: {
          processingTime: Date.now() - startTime,
          model: this.config.openai.model,
          fallbackUsed,
          confidence_tier: this.getConfidenceTier(intentResult.confidence)
        }
      };

      // Track metrics
      this.updateMetrics(result);

      logger.info('NLU processing completed', {
        conversationId: conversationContext?.conversationId,
        intent: result.intent,
        confidence: result.confidence,
        processingTime: result.processing.processingTime,
        fallbackUsed
      });

      return result;

    } catch (error) {
      logger.error('NLU processing failed', {
        conversationId: conversationContext?.conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        utterance: utterance.substring(0, 100)
      });

      // Return safe fallback
      return this.createFallbackResult(utterance, Date.now() - startTime, conversationContext);
    }
  }

  /**
   * Analyze sentiment specifically for elderly patients
   */
  async analyzeSentimentForElderly(
    utterance: string, 
    conversationContext?: ConversationContext
  ): Promise<{ sentiment: number; markers: string[]; concerns: string[] }> {
    try {
      const sentimentResult = await this.intentService.analyzeSentiment(utterance);
      
      // Detect elderly-specific concerns
      const concerns = this.detectElderlyConcerns(utterance, sentimentResult.emotionalMarkers);
      
      // Adjust sentiment interpretation for elderly patients
      const adjustedSentiment = this.adjustSentimentForAge(
        sentimentResult.sentiment,
        concerns,
        conversationContext
      );

      return {
        sentiment: adjustedSentiment,
        markers: sentimentResult.emotionalMarkers,
        concerns
      };

    } catch (error) {
      logger.error('Elderly sentiment analysis failed', { error });
      return {
        sentiment: 0,
        markers: [],
        concerns: []
      };
    }
  }

  /**
   * Extract entities with medical context validation
   */
  async extractMedicalEntities(
    utterance: string, 
    intent: string
  ): Promise<ExtractedEntity[]> {
    try {
      const entities = await this.intentService.extractEntities(utterance, intent);
      
      // Validate and normalize medical entities
      return this.validateMedicalEntities(entities);

    } catch (error) {
      logger.error('Medical entity extraction failed', { error, intent });
      return [];
    }
  }

  /**
   * Generate contextual responses for conversation flow
   */
  generateContextualResponse(
    nluResult: NLUResult,
    conversationContext?: ConversationContext
  ): {
    primaryResponse: string;
    fallbackResponses: string[];
    clarificationNeeded: boolean;
    escalationSuggested: boolean;
  } {
    const { intent, confidence, context, entities } = nluResult;
    
    // Determine if clarification is needed
    const clarificationNeeded = confidence < this.config.confidence.mediumTier ||
                               this.detectConfusionIndicators(intent, entities, conversationContext);

    // Determine if escalation is suggested
    const escalationSuggested = context.urgency === 'urgent' ||
                               context.category === 'emergency' ||
                               this.detectEscalationNeed(nluResult, conversationContext);

    // Select appropriate primary response
    const primaryResponse = this.selectPrimaryResponse(
      nluResult,
      conversationContext,
      clarificationNeeded,
      escalationSuggested
    );

    // Generate fallback responses
    const fallbackResponses = this.generateFallbackResponses(intent, context.category);

    return {
      primaryResponse,
      fallbackResponses,
      clarificationNeeded,
      escalationSuggested
    };
  }

  /**
   * Private helper methods
   */

  private preprocessForElderly(utterance: string, context?: ConversationContext): string {
    let processed = utterance.toLowerCase().trim();

    // Handle common elderly speech patterns
    if (context?.patientInfo?.hearingDifficulty) {
      // Account for potential mishearing
      processed = this.correctCommonMishearings(processed);
    }

    // Handle repetition (common in elderly speech)
    processed = this.handleRepetition(processed);

    // Normalize medical terminology
    processed = this.normalizeMedicalTerms(processed);

    return processed;
  }

  private correctCommonMishearings(utterance: string): string {
    const corrections: Record<string, string> = {
      'i exam': 'eye exam',
      'glue coma': 'glaucoma', 
      'contact lenses': 'contact lens',
      'dr smith': 'doctor smith',
      'a pointment': 'appointment'
    };

    let corrected = utterance;
    for (const [misheard, correct] of Object.entries(corrections)) {
      corrected = corrected.replace(new RegExp(misheard, 'gi'), correct);
    }

    return corrected;
  }

  private handleRepetition(utterance: string): string {
    // Remove simple repetitions common in elderly speech
    const words = utterance.split(' ');
    const deduped = words.filter((word, index) => {
      if (index === 0) return true;
      return word !== words[index - 1];
    });
    
    return deduped.join(' ');
  }

  private normalizeMedicalTerms(utterance: string): string {
    const normalizations: Record<string, string> = {
      'checkup': 'eye exam',
      'check up': 'eye exam',
      'vision test': 'eye exam',
      'contacts': 'contact lens',
      'glasses exam': 'eye exam',
      'prescription check': 'eye exam'
    };

    let normalized = utterance;
    for (const [term, standard] of Object.entries(normalizations)) {
      normalized = normalized.replace(new RegExp(term, 'gi'), standard);
    }

    return normalized;
  }

  private buildIntentContext(conversationContext?: ConversationContext): any {
    if (!conversationContext) return undefined;

    return {
      previousIntent: conversationContext.previousIntent,
      currentTopic: conversationContext.currentTopic,
      verificationStatus: conversationContext.verificationStatus,
      emotionalState: conversationContext.emotionalState,
      turnCount: conversationContext.turnCount,
      recentTopics: conversationContext.recentTopics,
      isElderly: conversationContext.patientInfo?.isElderly,
      hearingDifficulty: conversationContext.patientInfo?.hearingDifficulty
    };
  }

  private async analyzeConversationFlow(
    intentResult: IntentResult,
    conversationContext?: ConversationContext
  ): Promise<NLUResult['conversationFlow']> {
    const transitions: string[] = [];
    let nextPhase: string | undefined;
    let contextPreserved = true;

    // Determine next conversation phase based on intent
    switch (intentResult.intent) {
      case 'greeting':
        nextPhase = 'patient_verification';
        transitions.push('greeting_to_verification');
        break;
      case 'verification_request':
        nextPhase = 'intent_discovery';
        transitions.push('verification_to_discovery');
        break;
      case 'appointment_request':
        nextPhase = 'information_gathering';
        transitions.push('discovery_to_gathering');
        break;
      case 'emergency':
        nextPhase = 'escalation';
        transitions.push('any_to_escalation');
        break;
      case 'goodbye':
        nextPhase = 'closure';
        transitions.push('any_to_closure');
        break;
    }

    // Check context preservation
    if (conversationContext?.currentTopic && 
        intentResult.context?.topic !== conversationContext.currentTopic) {
      contextPreserved = false;
      transitions.push('topic_change');
    }

    return {
      nextPhase,
      transitions,
      contextPreserved
    };
  }

  private adaptResponsesForElderly(
    responses: string[], 
    context?: ConversationContext
  ): string[] {
    if (!context?.patientInfo?.isElderly) return responses;

    return responses.map(response => {
      // Make responses more patient and clear for elderly
      if (context.patientInfo?.preferredPace === 'slow') {
        return this.simplifyLanguage(response);
      }
      
      if (context.patientInfo?.hearingDifficulty) {
        return `${response} Please let me know if you need me to repeat anything.`;
      }

      return response;
    });
  }

  private simplifyLanguage(text: string): string {
    // Simplify complex sentences for elderly patients
    return text
      .replace(/I'd be happy to/g, 'I can')
      .replace(/at your convenience/g, 'when you want')
      .replace(/assistance/g, 'help')
      .replace(/accommodate/g, 'help with');
  }

  private detectElderlyConcerns(utterance: string, markers: string[]): string[] {
    const concerns: string[] = [];
    
    const concernPatterns = {
      'technology_difficulty': ['hard to hear', 'phone issues', 'connection'],
      'medical_anxiety': ['worried', 'concerned', 'scared', 'nervous'],
      'clarity_needed': ['don\'t understand', 'repeat', 'unclear'],
      'urgency_unclear': ['soon', 'urgent', 'right away', 'emergency']
    };

    const lowerUtterance = utterance.toLowerCase();
    
    for (const [concern, patterns] of Object.entries(concernPatterns)) {
      if (patterns.some(pattern => lowerUtterance.includes(pattern))) {
        concerns.push(concern);
      }
    }

    return concerns;
  }

  private adjustSentimentForAge(
    sentiment: number, 
    concerns: string[], 
    context?: ConversationContext
  ): number {
    let adjusted = sentiment;

    // Elderly patients may express concern more readily
    if (concerns.includes('medical_anxiety')) {
      adjusted = Math.max(adjusted - 0.2, -1);
    }

    // Technology difficulties may mask true sentiment
    if (concerns.includes('technology_difficulty')) {
      adjusted = Math.min(adjusted + 0.1, 1);
    }

    return adjusted;
  }

  private validateMedicalEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    return entities.filter(entity => {
      // Validate medical entity values
      switch (entity.type) {
        case 'appointment_type':
          return this.isValidAppointmentType(entity.value);
        case 'doctor_name':
          return this.isValidDoctorName(entity.value);
        case 'symptom':
          return this.isValidSymptom(entity.value);
        case 'insurance_provider':
          return this.isValidInsurance(entity.value);
        default:
          return true;
      }
    });
  }

  private isValidAppointmentType(value: string): boolean {
    const validTypes = [
      'eye exam', 'comprehensive eye exam', 'routine exam',
      'contact lens fitting', 'contact lens exam',
      'glaucoma screening', 'glaucoma test',
      'diabetic eye exam', 'pediatric exam',
      'emergency visit', 'follow up', 'followup'
    ];
    
    return validTypes.some(type => 
      value.toLowerCase().includes(type.toLowerCase())
    );
  }

  private isValidDoctorName(value: string): boolean {
    // Basic validation for doctor names
    return /^(dr\.?|doctor)\s+[a-z]+/i.test(value) || 
           /^[a-z]+\s+(md|od)/i.test(value);
  }

  private isValidSymptom(value: string): boolean {
    const eyeSymptoms = [
      'pain', 'blurred vision', 'double vision', 'flashing lights',
      'floaters', 'dry eyes', 'red eyes', 'itchy eyes',
      'vision loss', 'headache', 'sensitivity to light'
    ];
    
    return eyeSymptoms.some(symptom => 
      value.toLowerCase().includes(symptom.toLowerCase())
    );
  }

  private isValidInsurance(value: string): boolean {
    const insuranceProviders = [
      'medicare', 'medicaid', 'blue cross', 'bcbs', 'aetna',
      'cigna', 'humana', 'united healthcare', 'anthem'
    ];
    
    return insuranceProviders.some(provider => 
      value.toLowerCase().includes(provider.toLowerCase())
    );
  }

  private getConfidenceTier(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= this.config.confidence.highTier) return 'high';
    if (confidence >= this.config.confidence.mediumTier) return 'medium';
    return 'low';
  }

  private detectConfusionIndicators(
    intent: string, 
    entities: ExtractedEntity[], 
    context?: ConversationContext
  ): boolean {
    // Check if patient seems confused
    const confusionIntents = ['clarification_request', 'unknown'];
    if (confusionIntents.includes(intent)) return true;

    // Check for repeated similar requests
    if (context?.recentTopics.includes(intent) && entities.length === 0) {
      return true;
    }

    return false;
  }

  private detectEscalationNeed(
    result: NLUResult, 
    context?: ConversationContext
  ): boolean {
    // Multiple factors that suggest escalation
    return result.context.urgency === 'urgent' ||
           result.context.category === 'emergency' ||
           (result.confidence < this.config.confidence.mediumTier && 
            context?.turnCount && context.turnCount > 3) ||
           result.emotionalMarkers?.includes('frustrated') ||
           result.emotionalMarkers?.includes('angry');
  }

  private selectPrimaryResponse(
    result: NLUResult,
    context?: ConversationContext,
    clarificationNeeded?: boolean,
    escalationSuggested?: boolean
  ): string {
    if (escalationSuggested) {
      return "I understand this is important. Let me connect you with our staff who can help you right away.";
    }

    if (clarificationNeeded) {
      return "I want to make sure I understand exactly what you need. Could you tell me a bit more about what you're looking for?";
    }

    // Use suggested responses from intent recognition
    const suggestions = result.context.suggestedResponses;
    return suggestions[0] || "I understand. How can I help you with that?";
  }

  private generateFallbackResponses(intent: string, category: string): string[] {
    const fallbacks = [
      "I'm here to help. Could you please tell me what you need assistance with?",
      "Let me make sure I understand. What can I help you with today?",
      "I want to provide you with the best help possible. What are you looking for?"
    ];

    if (category === 'emergency') {
      fallbacks.unshift(
        "If this is a medical emergency, please hang up and call 911 immediately.",
        "For urgent medical issues, I can connect you with our staff right now."
      );
    }

    return fallbacks;
  }

  private createFallbackResult(
    utterance: string, 
    processingTime: number, 
    context?: ConversationContext
  ): NLUResult {
    return {
      intent: this.config.fallback.intent,
      confidence: 0.1,
      entities: [],
      sentiment: 0,
      emotionalMarkers: [],
      context: {
        urgency: 'medium',
        topic: 'unclear',
        category: 'general',
        requiresVerification: false,
        requiresFollowUp: true,
        suggestedResponses: [
          "I'm sorry, I didn't quite understand that. Could you please tell me how I can help you?",
          "I want to make sure I help you correctly. What are you calling about today?"
        ]
      },
      conversationFlow: {
        transitions: ['fallback_triggered'],
        contextPreserved: false
      },
      processing: {
        processingTime,
        model: this.config.openai.model,
        fallbackUsed: true,
        confidence_tier: 'low'
      }
    };
  }

  private updateMetrics(result: NLUResult): void {
    const key = `${result.intent}_${result.processing.confidence_tier}`;
    const current = this.processingMetrics.get(key) || 0;
    this.processingMetrics.set(key, current + 1);
  }

  /**
   * Public utility methods
   */

  getProcessingMetrics(): Record<string, number> {
    return Object.fromEntries(this.processingMetrics);
  }

  getAvailableIntents(): string[] {
    return this.intentService.getAvailableIntents();
  }

  updateConfiguration(updates: Partial<NLUConfig>): void {
    if (updates.confidence) {
      Object.assign(this.config.confidence, updates.confidence);
      this.intentService.updateConfidenceThreshold(this.config.confidence.threshold);
    }
    
    if (updates.elderly) {
      Object.assign(this.config.elderly, updates.elderly);
    }
  }
}