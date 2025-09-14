import { 
  ConversationState,
  ConversationStatus,
  ConversationPhase,
  ConversationTransition,
  ConversationTurn,
  TurnContext,
  ContextualReference
} from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { ConversationManager } from './conversationManager';

const logger = createLogger('conversation-flow-handler');

interface FlowHandlerConfig {
  enableSmartTransitions: boolean;
  contextWindowTurns: number;
  confidenceThreshold: number;
  enableTopicTracking: boolean;
}

export class ConversationFlowHandler {
  private conversationManager: ConversationManager;
  private config: FlowHandlerConfig;
  
  // Define conversation transitions
  private transitions: ConversationTransition[] = [
    {
      from: ConversationPhase.GREETING,
      to: ConversationPhase.PATIENT_VERIFICATION,
      trigger: 'patient_identified',
      condition: (state) => !!state.patientName || !!state.patientId
    },
    {
      from: ConversationPhase.GREETING,
      to: ConversationPhase.INTENT_DISCOVERY,
      trigger: 'skip_verification',
      condition: (state) => state.turns.some(turn => 
        turn.intent === 'information_request' || turn.intent === 'appointment_inquiry'
      )
    },
    {
      from: ConversationPhase.PATIENT_VERIFICATION,
      to: ConversationPhase.INTENT_DISCOVERY,
      trigger: 'verification_complete',
      condition: (state) => state.verificationStatus === 'verified'
    },
    {
      from: ConversationPhase.PATIENT_VERIFICATION,
      to: ConversationPhase.ESCALATION,
      trigger: 'verification_failed',
      condition: (state) => state.verificationAttempts >= 3
    },
    {
      from: ConversationPhase.INTENT_DISCOVERY,
      to: ConversationPhase.INFORMATION_GATHERING,
      trigger: 'needs_more_info',
      condition: (state) => state.currentIntent && ['appointment_request', 'complex_inquiry'].includes(state.currentIntent)
    },
    {
      from: ConversationPhase.INTENT_DISCOVERY,
      to: ConversationPhase.INFORMATION_PROVIDING,
      trigger: 'can_provide_info',
      condition: (state) => state.currentIntent && ['hours_inquiry', 'location_inquiry', 'insurance_inquiry'].includes(state.currentIntent)
    },
    {
      from: ConversationPhase.INFORMATION_GATHERING,
      to: ConversationPhase.ACTION_PLANNING,
      trigger: 'sufficient_info',
      condition: (state) => state.pendingActions.length === 0 || state.conversationGoals.some(goal => state.completedGoals.includes(goal))
    },
    {
      from: ConversationPhase.INFORMATION_PROVIDING,
      to: ConversationPhase.CONFIRMATION,
      trigger: 'info_provided',
      condition: (state) => state.turns.filter(turn => turn.speaker === 'ai').length > 0
    },
    {
      from: ConversationPhase.ACTION_PLANNING,
      to: ConversationPhase.CONFIRMATION,
      trigger: 'actions_planned',
      condition: (state) => state.pendingActions.length > 0
    },
    {
      from: ConversationPhase.CONFIRMATION,
      to: ConversationPhase.RESOLUTION,
      trigger: 'confirmed',
      condition: (state) => state.turns.some(turn => 
        turn.speaker === 'patient' && (
          turn.text.toLowerCase().includes('yes') || 
          turn.text.toLowerCase().includes('correct') ||
          turn.text.toLowerCase().includes('that works')
        )
      )
    },
    {
      from: ConversationPhase.CONFIRMATION,
      to: ConversationPhase.INFORMATION_GATHERING,
      trigger: 'needs_clarification',
      condition: (state) => state.clarificationRequests > 0
    },
    {
      from: ConversationPhase.RESOLUTION,
      to: ConversationPhase.CLOSURE,
      trigger: 'resolved',
      condition: (state) => state.completedGoals.length >= state.conversationGoals.length
    },
    {
      from: ConversationPhase.CLOSURE,
      to: ConversationPhase.INTENT_DISCOVERY,
      trigger: 'additional_request',
      condition: (state) => state.turns.some(turn => 
        turn.speaker === 'patient' && turn.followUpRequired
      )
    }
  ];

  constructor(conversationManager: ConversationManager, config: FlowHandlerConfig) {
    this.conversationManager = conversationManager;
    this.config = config;
  }

  /**
   * Process a new conversation turn and handle flow transitions
   */
  async processTurn(
    conversationId: string,
    turn: ConversationTurn
  ): Promise<{
    nextPhase?: ConversationPhase;
    suggestedResponse?: string;
    contextPreserved: boolean;
    requiresFollowUp: boolean;
  }> {
    const state = await this.conversationManager.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get turn context for context preservation
    const turnContext = await this.conversationManager.getConversationContext(conversationId);
    
    // Assess context preservation
    const contextPreserved = await this.assessContextPreservation(state, turn, turnContext);
    
    // Check for phase transitions
    const nextPhase = await this.evaluatePhaseTransition(state, turn);
    
    // Generate suggested response based on context
    const suggestedResponse = await this.generateContextualResponse(state, turn, turnContext);
    
    // Determine if follow-up is required
    const requiresFollowUp = this.assessFollowUpRequirement(state, turn, turnContext);

    logger.debug('Turn processed', {
      conversationId,
      currentPhase: state.status,
      nextPhase,
      contextPreserved,
      requiresFollowUp,
      turnNumber: state.turns.length
    });

    return {
      nextPhase,
      suggestedResponse,
      contextPreserved,
      requiresFollowUp
    };
  }

  /**
   * Handle topic changes while preserving context
   */
  async handleTopicTransition(
    conversationId: string,
    previousTopic: string,
    newTopic: string,
    transitionContext?: string
  ): Promise<{
    bridgeMessage?: string;
    contextLost: boolean;
    requiresClarification: boolean;
  }> {
    const state = await this.conversationManager.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Assess context preservation across topic change
    const contextLost = this.assessTopicContextLoss(state, previousTopic, newTopic);
    
    // Determine if clarification is needed
    const requiresClarification = this.assessTopicClarificationNeed(state, previousTopic, newTopic);
    
    // Generate bridge message if needed
    let bridgeMessage: string | undefined;
    if (contextLost && this.config.enableSmartTransitions) {
      bridgeMessage = this.generateTopicBridge(previousTopic, newTopic, transitionContext);
    }

    // Update conversation state
    await this.conversationManager.handleTopicChange(conversationId, newTopic, transitionContext);

    logger.info('Topic transition handled', {
      conversationId,
      previousTopic,
      newTopic,
      contextLost,
      requiresClarification,
      hasBridge: !!bridgeMessage
    });

    return {
      bridgeMessage,
      contextLost,
      requiresClarification
    };
  }

  /**
   * Generate contextual follow-up questions
   */
  async generateFollowUpQuestion(
    conversationId: string,
    context: 'clarification' | 'elaboration' | 'confirmation' | 'next_steps'
  ): Promise<string> {
    const state = await this.conversationManager.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const turnContext = await this.conversationManager.getConversationContext(conversationId);
    
    switch (context) {
      case 'clarification':
        return this.generateClarificationQuestion(state, turnContext);
      case 'elaboration':
        return this.generateElaborationQuestion(state, turnContext);
      case 'confirmation':
        return this.generateConfirmationQuestion(state, turnContext);
      case 'next_steps':
        return this.generateNextStepsQuestion(state, turnContext);
      default:
        return "Is there anything else I can help you with today?";
    }
  }

  /**
   * Private helper methods
   */

  private async assessContextPreservation(
    state: ConversationState,
    turn: ConversationTurn,
    turnContext: TurnContext | null
  ): Promise<boolean> {
    if (!turnContext) return false;

    // Check if turn references previous context
    if (turnContext.referencesHistory) {
      return true;
    }

    // Check topic continuity
    if (turnContext.topicContinuity) {
      return true;
    }

    // Check entity references
    if (turnContext.contextualReferences.length > 0) {
      return true;
    }

    // Check if it's a natural continuation
    const recentTurns = state.turns.slice(-this.config.contextWindowTurns);
    const hasLogicalFlow = this.assessLogicalFlow(recentTurns, turn);

    return hasLogicalFlow;
  }

  private async evaluatePhaseTransition(
    state: ConversationState,
    turn: ConversationTurn
  ): Promise<ConversationPhase | undefined> {
    // Map conversation status to phase
    const currentPhase = this.mapStatusToPhase(state.status);
    
    // Find applicable transitions
    const applicableTransitions = this.transitions.filter(transition => 
      transition.from === currentPhase
    );

    for (const transition of applicableTransitions) {
      if (transition.condition && transition.condition(state)) {
        logger.debug('Phase transition found', {
          from: transition.from,
          to: transition.to,
          trigger: transition.trigger
        });
        return transition.to;
      }
    }

    return undefined;
  }

  private async generateContextualResponse(
    state: ConversationState,
    turn: ConversationTurn,
    turnContext: TurnContext | null
  ): Promise<string> {
    // Generate response based on context and conversation state
    if (!turnContext) {
      return "I understand. How can I help you further?";
    }

    // Handle clarification needs
    if (turnContext.requiresClarification) {
      return this.generateClarificationResponse(state, turn);
    }

    // Handle history references
    if (turnContext.referencesHistory) {
      return this.generateHistoryAwareResponse(state, turn, turnContext);
    }

    // Handle topic continuity
    if (turnContext.topicContinuity) {
      return this.generateTopicContinuationResponse(state, turn);
    }

    // Default contextual response
    return this.generateDefaultContextualResponse(state, turn);
  }

  private assessFollowUpRequirement(
    state: ConversationState,
    turn: ConversationTurn,
    turnContext: TurnContext | null
  ): boolean {
    // Explicit follow-up requested
    if (turn.followUpRequired) {
      return true;
    }

    // Incomplete goals
    if (state.conversationGoals.length > state.completedGoals.length) {
      return true;
    }

    // Pending actions
    if (state.pendingActions.some(action => action.status === 'pending')) {
      return true;
    }

    // Clarification needed
    if (turnContext?.requiresClarification) {
      return true;
    }

    // Open-ended patient response
    if (turn.speaker === 'patient' && this.isOpenEndedResponse(turn.text)) {
      return true;
    }

    return false;
  }

  private assessTopicContextLoss(
    state: ConversationState,
    previousTopic: string,
    newTopic: string
  ): boolean {
    // Check if topics are related
    const relatedTopics = this.getRelatedTopics(previousTopic);
    if (relatedTopics.includes(newTopic)) {
      return false;
    }

    // Check if there's contextual connection in recent turns
    const recentTurns = state.turns.slice(-3);
    const hasContextualBridge = recentTurns.some(turn => 
      turn.text.toLowerCase().includes(previousTopic.toLowerCase()) &&
      turn.text.toLowerCase().includes(newTopic.toLowerCase())
    );

    return !hasContextualBridge;
  }

  private assessTopicClarificationNeed(
    state: ConversationState,
    previousTopic: string,
    newTopic: string
  ): boolean {
    // If context is lost and topics are very different
    const contextLost = this.assessTopicContextLoss(state, previousTopic, newTopic);
    const topicsVeryDifferent = !this.getRelatedTopics(previousTopic).includes(newTopic);
    
    return contextLost && topicsVeryDifferent && state.turns.length > 3;
  }

  private generateTopicBridge(
    previousTopic: string,
    newTopic: string,
    context?: string
  ): string {
    const bridges = [
      `I understand you'd like to switch from discussing ${previousTopic} to ${newTopic}. Let me help you with that.`,
      `Moving on from ${previousTopic}, let's talk about ${newTopic}.`,
      `I see you want to ask about ${newTopic} now. ${context || 'How can I assist you with that?'}`,
      `Thank you for that information about ${previousTopic}. Now, regarding ${newTopic}...`
    ];

    return bridges[Math.floor(Math.random() * bridges.length)];
  }

  private generateClarificationQuestion(
    state: ConversationState,
    turnContext: TurnContext | null
  ): string {
    const lastTurn = state.turns[state.turns.length - 1];
    
    if (lastTurn?.intent) {
      switch (lastTurn.intent) {
        case 'appointment_request':
          return "I'd be happy to help you schedule an appointment. Could you tell me what type of appointment you're looking for?";
        case 'insurance_inquiry':
          return "I can help with insurance questions. What specifically would you like to know about your coverage?";
        case 'hours_inquiry':
          return "I can provide our current hours. Are you looking for today's hours or our general schedule?";
        default:
          return "I want to make sure I understand correctly. Could you help me clarify what you're looking for?";
      }
    }

    return "I want to make sure I help you with exactly what you need. Could you tell me a bit more about what you're looking for?";
  }

  private generateElaborationQuestion(
    state: ConversationState,
    turnContext: TurnContext | null
  ): string {
    const currentTopic = state.currentTopic;
    
    if (currentTopic) {
      return `That's helpful information about ${currentTopic}. Is there anything specific about ${currentTopic} you'd like me to explain further?`;
    }

    return "That's good to know. Would you like me to provide more details about anything in particular?";
  }

  private generateConfirmationQuestion(
    state: ConversationState,
    turnContext: TurnContext | null
  ): string {
    if (state.pendingActions.length > 0) {
      const action = state.pendingActions[0];
      return `Just to confirm, you'd like me to ${action.description.toLowerCase()}. Is that correct?`;
    }

    if (state.conversationGoals.length > 0) {
      const goal = state.conversationGoals[state.conversationGoals.length - 1];
      return `So if I understand correctly, you're looking to ${goal.toLowerCase()}. Have I got that right?`;
    }

    return "Let me make sure I have this right. Does that sound accurate to you?";
  }

  private generateNextStepsQuestion(
    state: ConversationState,
    turnContext: TurnContext | null
  ): string {
    if (state.completedGoals.length > 0) {
      return "Great! We've covered that topic. Is there anything else I can help you with today?";
    }

    return "What would you like to do next? I'm here to help with any other questions you might have.";
  }

  private generateClarificationResponse(state: ConversationState, turn: ConversationTurn): string {
    return "I want to make sure I understand you correctly. Could you help me clarify what you're looking for?";
  }

  private generateHistoryAwareResponse(
    state: ConversationState,
    turn: ConversationTurn,
    turnContext: TurnContext
  ): string {
    const references = turnContext.contextualReferences;
    
    if (references.length > 0) {
      const reference = references[0];
      return `Yes, I remember we discussed ${reference.description}. How can I help you with that further?`;
    }

    return "I understand you're referring to something we talked about earlier. How can I help you with that?";
  }

  private generateTopicContinuationResponse(state: ConversationState, turn: ConversationTurn): string {
    const currentTopic = state.currentTopic;
    return `Continuing with ${currentTopic}, I'd be happy to help you further. What specific aspect would you like to know about?`;
  }

  private generateDefaultContextualResponse(state: ConversationState, turn: ConversationTurn): string {
    if (turn.intent) {
      switch (turn.intent) {
        case 'greeting':
          return "Hello! Thank you for calling Capitol Eye Care. How can I help you today?";
        case 'information_request':
          return "I'd be happy to provide that information for you.";
        case 'appointment_inquiry':
          return "I can help you with appointment scheduling. What type of appointment are you looking for?";
        default:
          return "I understand. How can I assist you with that?";
      }
    }

    return "Thank you for that information. How else can I help you today?";
  }

  private assessLogicalFlow(recentTurns: ConversationTurn[], newTurn: ConversationTurn): boolean {
    if (recentTurns.length === 0) return true;

    const lastTurn = recentTurns[recentTurns.length - 1];
    
    // Check if it's a natural response to a question
    if (lastTurn.speaker === 'ai' && lastTurn.text.includes('?') && newTurn.speaker === 'patient') {
      return true;
    }

    // Check if it continues the same intent
    if (lastTurn.intent && newTurn.intent && lastTurn.intent === newTurn.intent) {
      return true;
    }

    // Check if it's an elaboration
    const elaborationWords = ['also', 'and', 'additionally', 'furthermore', 'plus'];
    const hasElaboration = elaborationWords.some(word => 
      newTurn.text.toLowerCase().includes(word)
    );

    return hasElaboration;
  }

  private mapStatusToPhase(status: ConversationStatus): ConversationPhase {
    switch (status) {
      case ConversationStatus.INITIATED:
        return ConversationPhase.GREETING;
      case ConversationStatus.ACTIVE:
        return ConversationPhase.INTENT_DISCOVERY;
      case ConversationStatus.WAITING_PATIENT:
        return ConversationPhase.INFORMATION_GATHERING;
      case ConversationStatus.PROCESSING:
        return ConversationPhase.INFORMATION_PROVIDING;
      case ConversationStatus.COMPLETING:
        return ConversationPhase.RESOLUTION;
      case ConversationStatus.ESCALATED:
        return ConversationPhase.ESCALATION;
      default:
        return ConversationPhase.INTENT_DISCOVERY;
    }
  }

  private getRelatedTopics(topic: string): string[] {
    const topicMap: Record<string, string[]> = {
      'appointment': ['scheduling', 'booking', 'calendar', 'availability'],
      'insurance': ['coverage', 'billing', 'payment', 'copay', 'benefits'],
      'hours': ['schedule', 'time', 'open', 'closed', 'availability'],
      'location': ['address', 'directions', 'parking', 'building'],
      'services': ['treatments', 'procedures', 'exams', 'testing'],
      'doctors': ['providers', 'optometrists', 'staff', 'specialists']
    };

    return topicMap[topic.toLowerCase()] || [];
  }

  private isOpenEndedResponse(text: string): boolean {
    const openEndedIndicators = [
      'what about',
      'tell me more',
      'i also need',
      'what else',
      'another question',
      'one more thing'
    ];

    return openEndedIndicators.some(indicator => 
      text.toLowerCase().includes(indicator)
    );
  }
}