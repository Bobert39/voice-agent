import { NaturalLanguageService, NLUResult, ConversationContext as NLUContext } from '../nlu/naturalLanguageService';
import { ConversationManager } from './conversationManager';
import { ConversationFlowHandler } from './conversationFlowHandler';
import { ConversationState, ConversationTurn } from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('nlu-integration');

export interface EnhancedConversationTurn extends ConversationTurn {
  nluResult?: NLUResult;
  processingMetadata?: {
    processingTime: number;
    confidence: number;
    fallbackUsed: boolean;
    clarificationSuggested: boolean;
  };
}

export class NLUConversationIntegration {
  private nluService: NaturalLanguageService;
  private conversationManager: ConversationManager;
  private flowHandler: ConversationFlowHandler;

  constructor(
    nluService: NaturalLanguageService,
    conversationManager: ConversationManager,
    flowHandler: ConversationFlowHandler
  ) {
    this.nluService = nluService;
    this.conversationManager = conversationManager;
    this.flowHandler = flowHandler;
  }

  /**
   * Process patient utterance with full NLU analysis and conversation integration
   */
  async processPatientUtterance(
    conversationId: string,
    utterance: string,
    speaker: 'patient' | 'ai' | 'system' = 'patient'
  ): Promise<{
    conversationState: ConversationState;
    nluResult: NLUResult;
    suggestedResponse: string;
    followUpRequired: boolean;
    escalationNeeded: boolean;
  }> {
    try {
      logger.debug('Processing patient utterance with NLU integration', {
        conversationId,
        utteranceLength: utterance.length,
        speaker
      });

      // Get current conversation state
      const currentState = await this.conversationManager.getConversationState(conversationId);
      if (!currentState) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Build NLU context from conversation state
      const nluContext = this.buildNLUContext(currentState);

      // Process utterance with NLU
      const nluResult = await this.nluService.processUtterance(utterance, nluContext);

      // Generate contextual response using both NLU and conversation flow
      const responseGeneration = this.nluService.generateContextualResponse(nluResult, nluContext);

      // Add turn to conversation with NLU metadata
      const turnOptions = {
        intent: nluResult.intent,
        confidence: nluResult.confidence,
        sentiment: nluResult.sentiment,
        emotionalMarkers: nluResult.emotionalMarkers,
        topics: [nluResult.context.topic],
        entities: nluResult.entities,
        followUpRequired: responseGeneration.clarificationNeeded || nluResult.context.requiresFollowUp
      };

      const updatedState = await this.conversationManager.addTurn(
        conversationId,
        speaker,
        utterance,
        turnOptions
      );

      // Process conversation flow with enhanced context
      const flowResult = await this.flowHandler.processTurn(conversationId, {
        id: `turn-${Date.now()}`,
        timestamp: new Date(),
        speaker,
        text: utterance,
        ...turnOptions
      });

      // Determine appropriate response
      const suggestedResponse = this.selectOptimalResponse(
        responseGeneration,
        flowResult,
        nluResult
      );

      // Check escalation needs
      const escalationNeeded = this.shouldEscalate(nluResult, updatedState, responseGeneration);

      // Add AI response if appropriate
      if (suggestedResponse && !escalationNeeded) {
        await this.conversationManager.addTurn(
          conversationId,
          'ai',
          suggestedResponse,
          {
            intent: 'response',
            confidence: nluResult.confidence,
            followUpRequired: responseGeneration.clarificationNeeded
          }
        );
      }

      logger.info('NLU conversation processing completed', {
        conversationId,
        intent: nluResult.intent,
        confidence: nluResult.confidence,
        escalationNeeded,
        processingTime: nluResult.processing.processingTime
      });

      return {
        conversationState: updatedState,
        nluResult,
        suggestedResponse,
        followUpRequired: flowResult.requiresFollowUp || responseGeneration.clarificationNeeded,
        escalationNeeded
      };

    } catch (error) {
      logger.error('NLU conversation integration failed', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        utterance: utterance.substring(0, 100)
      });

      // Fallback to basic conversation handling
      return this.handleProcessingFailure(conversationId, utterance, speaker);
    }
  }

  /**
   * Generate AI response based on current conversation context
   */
  async generateAIResponse(
    conversationId: string,
    context?: {
      urgency?: 'low' | 'medium' | 'high' | 'urgent';
      topic?: string;
      requiresPersonalization?: boolean;
    }
  ): Promise<string> {
    try {
      const conversationState = await this.conversationManager.getConversationState(conversationId);
      if (!conversationState) {
        return "I apologize, but I'm having trouble accessing our conversation. How can I help you today?";
      }

      // Get the last patient turn
      const lastPatientTurn = conversationState.turns
        .slice()
        .reverse()
        .find(turn => turn.speaker === 'patient');

      if (!lastPatientTurn) {
        return "Hello! Thank you for calling Capitol Eye Care. How can I help you today?";
      }

      // Build NLU context and reprocess if needed
      const nluContext = this.buildNLUContext(conversationState);
      const nluResult = await this.nluService.processUtterance(lastPatientTurn.text, nluContext);

      // Generate contextual response
      const responseGeneration = this.nluService.generateContextualResponse(nluResult, nluContext);

      // Customize based on provided context
      let response = responseGeneration.primaryResponse;

      if (context?.urgency === 'urgent') {
        response = "I understand this is urgent. Let me connect you with our staff immediately.";
      } else if (context?.requiresPersonalization && conversationState.patientName) {
        response = `${conversationState.patientName}, ${response}`;
      }

      return response;

    } catch (error) {
      logger.error('AI response generation failed', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return "I want to help you. Could you please tell me what you need assistance with?";
    }
  }

  /**
   * Analyze conversation quality and suggest improvements
   */
  async analyzeConversationQuality(conversationId: string): Promise<{
    overallScore: number;
    intentAccuracy: number;
    entityExtraction: number;
    emotionalAwareness: number;
    responseAppropriate: number;
    suggestions: string[];
  }> {
    try {
      const conversationState = await this.conversationManager.getConversationState(conversationId);
      if (!conversationState) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Analyze patient turns with NLU
      const patientTurns = conversationState.turns.filter(turn => turn.speaker === 'patient');
      let totalIntentConfidence = 0;
      let entityExtractionScore = 0;
      let emotionalAwarenessScore = 0;

      for (const turn of patientTurns) {
        if (turn.confidence) {
          totalIntentConfidence += turn.confidence;
        }
        
        if (turn.entities && turn.entities.length > 0) {
          entityExtractionScore += 1;
        }

        if (turn.emotionalMarkers && turn.emotionalMarkers.length > 0) {
          emotionalAwarenessScore += 1;
        }
      }

      // Calculate scores
      const intentAccuracy = patientTurns.length > 0 ? totalIntentConfidence / patientTurns.length : 0;
      const entityExtraction = patientTurns.length > 0 ? entityExtractionScore / patientTurns.length : 0;
      const emotionalAwareness = patientTurns.length > 0 ? emotionalAwarenessScore / patientTurns.length : 0;

      // Analyze response appropriateness
      const responseAppropriate = this.analyzeResponseQuality(conversationState);

      // Calculate overall score
      const overallScore = (intentAccuracy + entityExtraction + emotionalAwareness + responseAppropriate) / 4;

      // Generate suggestions
      const suggestions = this.generateQualityImprovementSuggestions({
        intentAccuracy,
        entityExtraction,
        emotionalAwareness,
        responseAppropriate,
        conversationState
      });

      return {
        overallScore,
        intentAccuracy,
        entityExtraction,
        emotionalAwareness,
        responseAppropriate,
        suggestions
      };

    } catch (error) {
      logger.error('Conversation quality analysis failed', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        overallScore: 0.5,
        intentAccuracy: 0.5,
        entityExtraction: 0.5,
        emotionalAwareness: 0.5,
        responseAppropriate: 0.5,
        suggestions: ['Unable to analyze conversation quality due to processing error.']
      };
    }
  }

  /**
   * Private helper methods
   */

  private buildNLUContext(conversationState: ConversationState): NLUContext {
    // Determine if patient is elderly based on conversation patterns
    const isElderly = this.detectElderlyPatient(conversationState);
    
    return {
      conversationId: conversationState.conversationId,
      previousIntent: conversationState.currentIntent,
      currentTopic: conversationState.currentTopic,
      verificationStatus: conversationState.verificationStatus,
      emotionalState: conversationState.emotionalState?.overall,
      turnCount: conversationState.turns.length,
      recentTopics: conversationState.contextualMemory.recentTopics,
      patientInfo: {
        isElderly,
        hearingDifficulty: this.detectHearingDifficulty(conversationState),
        preferredPace: this.detectPreferredPace(conversationState)
      }
    };
  }

  private detectElderlyPatient(conversationState: ConversationState): boolean {
    // Look for patterns that suggest elderly patient
    const indicators = [
      'medicare',
      'social security',
      'retirement',
      'senior',
      'hard of hearing',
      'can you repeat',
      'speak louder'
    ];

    const conversationText = conversationState.turns
      .map(turn => turn.text.toLowerCase())
      .join(' ');

    return indicators.some(indicator => conversationText.includes(indicator));
  }

  private detectHearingDifficulty(conversationState: ConversationState): boolean {
    const hearingIndicators = [
      'can you repeat',
      'didn\'t hear',
      'speak louder',
      'hard to hear',
      'hearing aid'
    ];

    const recentText = conversationState.turns
      .slice(-5)
      .map(turn => turn.text.toLowerCase())
      .join(' ');

    return hearingIndicators.some(indicator => recentText.includes(indicator));
  }

  private detectPreferredPace(conversationState: ConversationState): 'slow' | 'normal' | 'fast' {
    const avgTurnLength = conversationState.turns
      .filter(turn => turn.speaker === 'patient')
      .reduce((sum, turn) => sum + turn.text.length, 0) / 
      Math.max(conversationState.turns.filter(turn => turn.speaker === 'patient').length, 1);

    if (avgTurnLength < 20) return 'slow';
    if (avgTurnLength > 100) return 'fast';
    return 'normal';
  }

  private selectOptimalResponse(
    responseGeneration: any,
    flowResult: any,
    nluResult: NLUResult
  ): string {
    // Prioritize escalation responses
    if (responseGeneration.escalationSuggested) {
      return "I understand this is important. Let me connect you with our staff who can help you right away.";
    }

    // Use clarification if needed
    if (responseGeneration.clarificationNeeded) {
      return responseGeneration.primaryResponse;
    }

    // Use flow-suggested response if available
    if (flowResult.suggestedResponse) {
      return flowResult.suggestedResponse;
    }

    // Fall back to NLU-generated response
    return responseGeneration.primaryResponse;
  }

  private shouldEscalate(
    nluResult: NLUResult,
    conversationState: ConversationState,
    responseGeneration: any
  ): boolean {
    return responseGeneration.escalationSuggested ||
           nluResult.context.urgency === 'urgent' ||
           nluResult.context.category === 'emergency' ||
           conversationState.escalationFlags.length > 0 ||
           (nluResult.confidence < 0.3 && conversationState.turns.length > 5);
  }

  private async handleProcessingFailure(
    conversationId: string,
    utterance: string,
    speaker: 'patient' | 'ai' | 'system'
  ): Promise<any> {
    try {
      // Fallback to basic conversation handling
      const conversationState = await this.conversationManager.getConversationState(conversationId);
      if (!conversationState) {
        throw new Error('Conversation not found during fallback processing');
      }

      // Add turn with minimal processing
      const updatedState = await this.conversationManager.addTurn(
        conversationId,
        speaker,
        utterance,
        {
          intent: 'unknown',
          confidence: 0.1,
          followUpRequired: true
        }
      );

      return {
        conversationState: updatedState,
        nluResult: {
          intent: 'unknown',
          confidence: 0.1,
          entities: [],
          context: {
            urgency: 'medium' as const,
            topic: 'unclear',
            category: 'general' as const,
            requiresVerification: false,
            requiresFollowUp: true,
            suggestedResponses: [
              "I'm sorry, I'm having trouble understanding. Could you please tell me how I can help you?",
              "I want to make sure I help you correctly. What are you calling about today?"
            ]
          },
          conversationFlow: {
            transitions: ['fallback_triggered'],
            contextPreserved: false
          },
          processing: {
            processingTime: 0,
            model: 'fallback',
            fallbackUsed: true,
            confidence_tier: 'low' as const
          }
        },
        suggestedResponse: "I'm sorry, I'm having trouble understanding. Could you please tell me how I can help you?",
        followUpRequired: true,
        escalationNeeded: false
      };

    } catch (error) {
      logger.error('Fallback processing also failed', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error('Complete conversation processing failure');
    }
  }

  private analyzeResponseQuality(conversationState: ConversationState): number {
    const aiTurns = conversationState.turns.filter(turn => turn.speaker === 'ai');
    
    if (aiTurns.length === 0) return 0.5;

    // Analyze response appropriateness
    let appropriateCount = 0;
    
    aiTurns.forEach(turn => {
      // Check if response seems appropriate (basic heuristics)
      if (turn.text.length > 10 && 
          !turn.text.includes('error') && 
          !turn.text.includes('sorry')) {
        appropriateCount++;
      }
    });

    return aiTurns.length > 0 ? appropriateCount / aiTurns.length : 0.5;
  }

  private generateQualityImprovementSuggestions(analysis: any): string[] {
    const suggestions: string[] = [];

    if (analysis.intentAccuracy < 0.7) {
      suggestions.push('Consider improving intent recognition by providing more context in prompts');
    }

    if (analysis.entityExtraction < 0.5) {
      suggestions.push('Enhance entity extraction for medical terminology');
    }

    if (analysis.emotionalAwareness < 0.6) {
      suggestions.push('Improve emotional state detection for better patient care');
    }

    if (analysis.responseAppropriate < 0.7) {
      suggestions.push('Review AI responses for medical appropriateness and empathy');
    }

    if (analysis.conversationState.turns.length > 10 && analysis.overallScore < 0.6) {
      suggestions.push('Consider escalating long conversations with low quality scores');
    }

    return suggestions.length > 0 ? suggestions : ['Conversation quality is acceptable'];
  }
}