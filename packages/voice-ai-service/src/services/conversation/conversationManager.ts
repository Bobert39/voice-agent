import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ConversationState,
  ConversationStatus,
  ConversationTurn,
  ConversationEnding,
  TurnContext,
  EmotionalState,
  ConversationAnalytics
} from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { ConversationContextManager } from './contextManager';
import { EscalationManager } from '../escalation/escalationManager';

const logger = createLogger('conversation-manager');

interface ConversationManagerConfig {
  redisClient: Redis;
  sessionTimeoutSeconds: number;
  warningTimeoutSeconds: number[];
  gracePeriodSeconds: number;
  maxTurnsPerConversation: number;
  enableAnalytics: boolean;
}

export class ConversationManager {
  private redis: Redis;
  private contextManager: ConversationContextManager;
  private _escalationManager: EscalationManager;
  private config: ConversationManagerConfig;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private warningTimeouts: Map<string, NodeJS.Timeout[]> = new Map();

  constructor(
    config: ConversationManagerConfig,
    contextManager: ConversationContextManager,
    _escalationManager: EscalationManager
  ) {
    this.redis = config.redisClient;
    this.contextManager = contextManager;
    this._escalationManager = _escalationManager;
    this.config = config;
  }

  /**
   * Start a new conversation session
   */
  async startConversation(
    phoneNumber: string,
    patientId?: string,
    patientName?: string,
    sessionId?: string
  ): Promise<ConversationState> {
    const conversationId = uuidv4();
    const actualSessionId = sessionId || uuidv4();

    const initialState: ConversationState = {
      conversationId,
      sessionId: actualSessionId,
      patientId,
      patientName,
      phoneNumber,
      status: ConversationStatus.INITIATED,
      previousTopics: [],
      contextualMemory: {
        recentTopics: [],
        mentionedEntities: [],
        userPreferences: {},
        sessionGoals: [],
        discussedTopics: [],
        resolvedIssues: []
      },
      turns: [],
      intentHistory: [],
      conversationGoals: [],
      completedGoals: [],
      pendingActions: [],
      startTime: new Date(),
      lastActivity: new Date(),
      totalDuration: 0,
      misunderstandingCount: 0,
      clarificationRequests: 0,
      topicSwitches: 0,
      verificationStatus: 'unverified',
      verificationAttempts: 0,
      keyInsights: [],
      recommendedActions: [],
      escalationFlags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    // Store in Redis
    await this.saveConversationState(initialState);
    
    // Initialize legacy context manager for escalation compatibility
    this.contextManager.createSession(
      conversationId,
      actualSessionId,
      phoneNumber,
      patientId,
      patientName
    );

    // Setup timeout handling
    this.setupConversationTimeout(conversationId);

    logger.info('New conversation started', {
      conversationId,
      sessionId: actualSessionId,
      patientId,
      phoneNumber: this.maskPhoneNumber(phoneNumber)
    });

    return initialState;
  }

  /**
   * Add a turn to the conversation
   */
  async addTurn(
    conversationId: string,
    speaker: 'patient' | 'ai' | 'system',
    text: string,
    options: {
      intent?: string;
      confidence?: number;
      sentiment?: number;
      emotionalMarkers?: string[];
      topics?: string[];
      entities?: any[];
      followUpRequired?: boolean;
    } = {}
  ): Promise<ConversationState> {
    const state = await this.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const turn: ConversationTurn = {
      id: uuidv4(),
      timestamp: new Date(),
      speaker,
      text,
      intent: options.intent,
      confidence: options.confidence,
      sentiment: options.sentiment,
      emotionalMarkers: options.emotionalMarkers,
      topics: options.topics,
      entities: options.entities,
      followUpRequired: options.followUpRequired
    };

    // Add turn to conversation
    state.turns.push(turn);
    state.lastActivity = new Date();
    state.totalDuration = state.lastActivity.getTime() - state.startTime.getTime();
    state.updatedAt = new Date();
    state.version++;

    // Update intent tracking
    if (options.intent && speaker === 'patient') {
      if (state.currentIntent !== options.intent) {
        if (state.currentIntent) {
          state.intentHistory.push(state.currentIntent);
        }
        state.currentIntent = options.intent;
      }
    }

    // Update contextual memory
    await this.updateContextualMemory(state, turn);

    // Update emotional state
    if (options.sentiment !== undefined || options.emotionalMarkers?.length) {
      await this.updateEmotionalState(state, options.sentiment, options.emotionalMarkers);
    }

    // Extract and track topics
    if (options.topics?.length) {
      await this.updateTopicTracking(state, options.topics);
    }

    // Check for conversation flow transitions
    await this.checkFlowTransitions(state, turn);

    // Update legacy context manager for escalation compatibility
    this.contextManager.addConversationTurn(
      conversationId,
      speaker === 'system' ? 'ai' : speaker,
      text,
      options.intent,
      options.sentiment,
      options.emotionalMarkers
    );

    // Save updated state
    await this.saveConversationState(state);

    // Reset timeout
    this.setupConversationTimeout(conversationId);

    logger.debug('Turn added to conversation', {
      conversationId,
      speaker,
      intent: options.intent,
      turnCount: state.turns.length
    });

    return state;
  }

  /**
   * Handle topic changes and context preservation
   */
  async handleTopicChange(
    conversationId: string,
    newTopic: string,
    context?: string
  ): Promise<ConversationState> {
    const state = await this.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Track topic switch
    if (state.currentTopic && state.currentTopic !== newTopic) {
      state.topicSwitches++;
      state.previousTopics.push(state.currentTopic);
      
      // Add contextual information about the topic change
      await this.addTurn(conversationId, 'system', 
        `Topic changed from "${state.currentTopic}" to "${newTopic}"${context ? `: ${context}` : ''}`,
        { 
          topics: [newTopic],
          followUpRequired: false
        }
      );
    }

    state.currentTopic = newTopic;
    state.contextualMemory.recentTopics = [newTopic, ...state.contextualMemory.recentTopics.slice(0, 4)];
    
    if (!state.contextualMemory.discussedTopics.includes(newTopic)) {
      state.contextualMemory.discussedTopics.push(newTopic);
    }

    await this.saveConversationState(state);

    logger.info('Topic changed in conversation', {
      conversationId,
      previousTopic: state.previousTopics[state.previousTopics.length - 1],
      newTopic,
      topicSwitches: state.topicSwitches
    });

    return state;
  }

  /**
   * Get conversation context for follow-up questions
   */
  async getConversationContext(conversationId: string): Promise<TurnContext | null> {
    const state = await this.getConversationState(conversationId);
    if (!state) {
      return null;
    }

    const _lastTurn = state.turns[state.turns.length - 1];
    const previousTurn = state.turns[state.turns.length - 2];

    const context: TurnContext = {
      turnNumber: state.turns.length,
      previousTurn,
      topicContinuity: this.assessTopicContinuity(state),
      requiresClarification: this.assessClarificationNeed(state),
      referencesHistory: this.assessHistoryReferences(state),
      contextualReferences: await this.extractContextualReferences(state)
    };

    return context;
  }

  /**
   * End conversation gracefully
   */
  async endConversation(
    conversationId: string,
    endingType: ConversationEnding['type'],
    reason?: string,
    finalMessage?: string
  ): Promise<ConversationState> {
    const state = await this.getConversationState(conversationId);
    if (!state) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const ending: ConversationEnding = {
      type: endingType,
      reason,
      finalMessage,
      nextSteps: await this.generateNextSteps(state),
      followUpRequired: this.determineFollowUpRequired(state),
      completedGoals: state.completedGoals,
      incompleteGoals: state.conversationGoals.filter(goal => 
        !state.completedGoals.includes(goal)
      )
    };

    // Set appropriate status
    switch (endingType) {
      case 'natural':
        state.status = ConversationStatus.ENDED_NATURALLY;
        break;
      case 'timeout':
        state.status = ConversationStatus.ENDED_BY_TIMEOUT;
        break;
      case 'escalation':
        state.status = ConversationStatus.ESCALATED;
        break;
      case 'patient_request':
        state.status = ConversationStatus.ENDED_BY_PATIENT;
        break;
      case 'error':
        state.status = ConversationStatus.ERROR;
        break;
    }

    // Calculate final duration
    state.totalDuration = new Date().getTime() - state.startTime.getTime();
    state.updatedAt = new Date();
    state.version++;

    // Add final system turn
    if (finalMessage) {
      await this.addTurn(conversationId, 'system', finalMessage, {
        followUpRequired: false
      });
    }

    // Generate analytics if enabled
    if (this.config.enableAnalytics) {
      const analytics = await this.generateAnalytics(state);
      await this.saveConversationAnalytics(conversationId, analytics);
    }

    // Clean up timeouts
    this.clearConversationTimeouts(conversationId);

    // End legacy context manager session
    this.contextManager.endSession(conversationId);

    // Save final state
    await this.saveConversationState(state);

    // Set expiration for conversation data (keep for 7 days after end)
    await this.redis.expire(this.getConversationKey(conversationId), 7 * 24 * 60 * 60);

    logger.info('Conversation ended', {
      conversationId,
      endingType,
      duration: state.totalDuration,
      turns: state.turns.length,
      completedGoals: state.completedGoals.length,
      incompleteGoals: ending.incompleteGoals.length
    });

    return state;
  }

  /**
   * Handle conversation timeout with warnings
   */
  private async handleConversationTimeout(conversationId: string): Promise<void> {
    const state = await this.getConversationState(conversationId);
    if (!state) {
      return;
    }

    logger.info('Conversation timeout reached', {
      conversationId,
      duration: state.totalDuration,
      turns: state.turns.length
    });

    // Send timeout message
    const timeoutMessage = "I notice we've been talking for a while. Would you like to continue, or shall I help you with anything else before we finish?";
    
    await this.addTurn(conversationId, 'ai', timeoutMessage, {
      followUpRequired: true
    });

    // Give grace period for response
    setTimeout(async () => {
      const currentState = await this.getConversationState(conversationId);
      if (currentState && currentState.status === ConversationStatus.ACTIVE) {
        await this.endConversation(
          conversationId,
          'timeout',
          'No response during grace period',
          "Thank you for calling Capitol Eye Care. If you need further assistance, please don't hesitate to call back."
        );
      }
    }, this.config.gracePeriodSeconds * 1000);
  }

  /**
   * Get conversation state from Redis
   */
  async getConversationState(conversationId: string): Promise<ConversationState | null> {
    try {
      const data = await this.redis.get(this.getConversationKey(conversationId));
      if (!data) {
        return null;
      }
      
      const state = JSON.parse(data) as ConversationState;
      
      // Convert date strings back to Date objects
      state.startTime = new Date(state.startTime);
      state.lastActivity = new Date(state.lastActivity);
      state.createdAt = new Date(state.createdAt);
      state.updatedAt = new Date(state.updatedAt);
      
      if (state.expectedEndTime) {
        state.expectedEndTime = new Date(state.expectedEndTime);
      }

      if (state.emotionalState?.lastUpdated) {
        state.emotionalState.lastUpdated = new Date(state.emotionalState.lastUpdated);
      }

      // Convert turn timestamps
      state.turns = state.turns.map(turn => ({
        ...turn,
        timestamp: new Date(turn.timestamp)
      }));

      return state;
    } catch (error) {
      logger.error('Failed to get conversation state', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Save conversation state to Redis
   */
  private async saveConversationState(state: ConversationState): Promise<void> {
    try {
      const key = this.getConversationKey(state.conversationId);
      await this.redis.setex(
        key,
        this.config.sessionTimeoutSeconds,
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error('Failed to save conversation state', {
        conversationId: state.conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private getConversationKey(conversationId: string): string {
    return `voice-agent:conversation:${conversationId}`;
  }

  private setupConversationTimeout(conversationId: string): void {
    // Clear existing timeouts
    this.clearConversationTimeouts(conversationId);

    // Set warning timeouts
    const warningTimeouts = this.config.warningTimeoutSeconds.map((seconds, index) => {
      return setTimeout(async () => {
        const state = await this.getConversationState(conversationId);
        if (state && state.status === ConversationStatus.ACTIVE) {
          const warningMessage = index === 0 
            ? "We've been talking for a while. Is there anything else I can help you with today?"
            : "Just to let you know, I'll need to wrap up our conversation soon if there's nothing else you need.";
          
          await this.addTurn(conversationId, 'ai', warningMessage, {
            followUpRequired: true
          });
        }
      }, seconds * 1000);
    });

    this.warningTimeouts.set(conversationId, warningTimeouts);

    // Set final timeout
    const finalTimeout = setTimeout(() => {
      this.handleConversationTimeout(conversationId);
    }, this.config.sessionTimeoutSeconds * 1000);

    this.timeouts.set(conversationId, finalTimeout);
  }

  private clearConversationTimeouts(conversationId: string): void {
    // Clear warning timeouts
    const warningTimeouts = this.warningTimeouts.get(conversationId);
    if (warningTimeouts) {
      warningTimeouts.forEach(timeout => clearTimeout(timeout));
      this.warningTimeouts.delete(conversationId);
    }

    // Clear final timeout
    const finalTimeout = this.timeouts.get(conversationId);
    if (finalTimeout) {
      clearTimeout(finalTimeout);
      this.timeouts.delete(conversationId);
    }
  }

  private async updateContextualMemory(
    state: ConversationState,
    turn: ConversationTurn
  ): Promise<void> {
    // Update recent topics
    if (turn.topics?.length) {
      state.contextualMemory.recentTopics = [
        ...turn.topics,
        ...state.contextualMemory.recentTopics
      ].slice(0, 5);
    }

    // Update mentioned entities
    if (turn.entities?.length) {
      state.contextualMemory.mentionedEntities.push(...turn.entities);
      // Keep only recent entities (last 20)
      state.contextualMemory.mentionedEntities = 
        state.contextualMemory.mentionedEntities.slice(-20);
    }

    // Extract goals from patient turns
    if (turn.speaker === 'patient') {
      const goalKeywords = ['need to', 'want to', 'trying to', 'looking for', 'help me'];
      const text = turn.text.toLowerCase();
      
      for (const keyword of goalKeywords) {
        if (text.includes(keyword)) {
          const goalDescription = turn.text.substring(0, 100);
          if (!state.conversationGoals.some(goal => 
            goal.toLowerCase().includes(goalDescription.substring(0, 20).toLowerCase()))) {
            state.conversationGoals.push(goalDescription);
            state.contextualMemory.sessionGoals.push(goalDescription);
          }
          break;
        }
      }
    }
  }

  private async updateEmotionalState(
    state: ConversationState,
    sentiment?: number,
    emotionalMarkers?: string[]
  ): Promise<void> {
    if (!state.emotionalState) {
      state.emotionalState = {
        overall: 'neutral',
        confidence: 0,
        markers: [],
        trends: [],
        lastUpdated: new Date()
      };
    }

    // Update based on sentiment
    if (sentiment !== undefined) {
      let emotionalLevel: EmotionalState['overall'] = 'neutral';
      
      if (sentiment > 0.6) emotionalLevel = 'very_positive';
      else if (sentiment > 0.2) emotionalLevel = 'positive';
      else if (sentiment > -0.3) emotionalLevel = 'neutral';
      else if (sentiment > -0.6) emotionalLevel = 'concerned';
      else if (sentiment > -0.8) emotionalLevel = 'frustrated';
      else if (sentiment > -0.9) emotionalLevel = 'distressed';
      else emotionalLevel = 'angry';

      state.emotionalState.overall = emotionalLevel;
      state.emotionalState.confidence = Math.abs(sentiment);
      
      // Add to trends
      state.emotionalState.trends.push({
        timestamp: new Date(),
        state: emotionalLevel,
        confidence: Math.abs(sentiment)
      });

      // Keep only recent trends (last 10)
      state.emotionalState.trends = state.emotionalState.trends.slice(-10);
    }

    // Update markers
    if (emotionalMarkers?.length) {
      state.emotionalState.markers.push(...emotionalMarkers);
      state.emotionalState.markers = state.emotionalState.markers.slice(-15);
    }

    state.emotionalState.lastUpdated = new Date();

    // Check for escalation conditions
    if (state.emotionalState.overall === 'distressed' || 
        state.emotionalState.overall === 'angry' ||
        (state.emotionalState.overall === 'frustrated' && state.emotionalState.confidence > 0.7)) {
      
      if (!state.escalationFlags.includes('emotional_distress')) {
        state.escalationFlags.push('emotional_distress');
      }
    }
  }

  private async updateTopicTracking(state: ConversationState, topics: string[]): Promise<void> {
    for (const topic of topics) {
      if (!state.contextualMemory.discussedTopics.includes(topic)) {
        state.contextualMemory.discussedTopics.push(topic);
      }
    }
  }

  private async checkFlowTransitions(
    state: ConversationState,
    turn: ConversationTurn
  ): Promise<void> {
    // Simple flow management - can be extended with more sophisticated rules
    if (turn.speaker === 'patient' && turn.intent) {
      switch (turn.intent) {
        case 'greeting':
          if (state.status === ConversationStatus.INITIATED) {
            state.status = ConversationStatus.ACTIVE;
          }
          break;
        case 'verification_request':
          state.status = ConversationStatus.WAITING_PATIENT;
          break;
        case 'information_request':
          state.status = ConversationStatus.PROCESSING;
          break;
        case 'goodbye':
          state.status = ConversationStatus.COMPLETING;
          break;
      }
    }
  }

  private assessTopicContinuity(state: ConversationState): boolean {
    if (state.turns.length < 2) return true;

    const lastTurn = state.turns[state.turns.length - 1];
    const previousTurn = state.turns[state.turns.length - 2];

    if (!lastTurn?.topics || !previousTurn?.topics) return false;

    return lastTurn.topics.some(topic => previousTurn.topics?.includes(topic));
  }

  private assessClarificationNeed(state: ConversationState): boolean {
    const recentTurns = state.turns.slice(-3);
    return recentTurns.some(turn => 
      turn.text.toLowerCase().includes('sorry') ||
      turn.text.toLowerCase().includes('what') ||
      turn.text.toLowerCase().includes('clarify') ||
      turn.text.toLowerCase().includes('understand')
    );
  }

  private assessHistoryReferences(state: ConversationState): boolean {
    if (state.turns.length === 0) return false;

    const lastTurn = state.turns[state.turns.length - 1];
    const referenceWords = ['earlier', 'before', 'you said', 'mentioned', 'previous'];

    return referenceWords.some(word =>
      lastTurn?.text.toLowerCase().includes(word)
    );
  }

  private async extractContextualReferences(state: ConversationState): Promise<any[]> {
    // Simple implementation - can be enhanced with NLP
    const references: any[] = [];
    
    if (state.turns.length > 0) {
      const lastTurn = state.turns[state.turns.length - 1];
      
      // Check for entity references
      state.contextualMemory.mentionedEntities.forEach(entity => {
        if (lastTurn?.text.toLowerCase().includes(entity.value.toLowerCase())) {
          references.push({
            type: 'entity_mention',
            entityId: entity.value,
            confidence: 0.8,
            description: `References entity: ${entity.value}`
          });
        }
      });

      // Check for topic references
      state.contextualMemory.recentTopics.forEach(topic => {
        if (lastTurn?.text.toLowerCase().includes(topic.toLowerCase())) {
          references.push({
            type: 'topic_reference',
            confidence: 0.7,
            description: `References topic: ${topic}`
          });
        }
      });
    }

    return references;
  }

  private async generateNextSteps(state: ConversationState): Promise<string[]> {
    const nextSteps: string[] = [];

    // Based on conversation state and goals
    const incompleteGoals = state.conversationGoals.filter(goal => !state.completedGoals.includes(goal));
    if (incompleteGoals.length > 0) {
      nextSteps.push('Follow up on incomplete goals: ' + incompleteGoals.join(', '));
    }

    if (state.pendingActions.length > 0) {
      nextSteps.push('Complete pending actions: ' + state.pendingActions.map(a => a.description).join(', '));
    }

    if (state.verificationStatus === 'failed') {
      nextSteps.push('Patient verification needed for future interactions');
    }

    if (state.escalationFlags.length > 0) {
      nextSteps.push('Staff follow-up recommended due to: ' + state.escalationFlags.join(', '));
    }

    return nextSteps.length > 0 ? nextSteps : ['No specific follow-up required'];
  }

  private determineFollowUpRequired(state: ConversationState): boolean {
    return state.conversationGoals.length > state.completedGoals.length ||
           state.pendingActions.some(action => action.status !== 'completed') ||
           state.escalationFlags.length > 0 ||
           state.verificationStatus === 'failed';
  }

  private async generateAnalytics(state: ConversationState): Promise<ConversationAnalytics> {
    // Implementation would include more sophisticated analytics
    return {
      conversationId: state.conversationId,
      quality: {
        overallScore: 85, // Placeholder
        clarityScore: 80,
        completenessScore: 90,
        empathyScore: 75,
        professionalismScore: 95,
        accuracyScore: 85
      },
      efficiency: {
        turnsToResolution: state.turns.length,
        averageTurnLength: state.turns.reduce((sum, turn) => sum + turn.text.length, 0) / state.turns.length,
        topicSwitchFrequency: state.topicSwitches / state.turns.length,
        timeToFirstIntent: 0, // Would calculate based on turn timestamps
        goalCompletionRate: state.completedGoals.length / Math.max(state.conversationGoals.length, 1),
        redundancyScore: 0.1 // Placeholder
      },
      patientExperience: {
        waitTimes: [], // Would track AI response times
        frustrationIndicators: state.misunderstandingCount + state.clarificationRequests,
        satisfactionSignals: state.emotionalState?.overall === 'positive' || state.emotionalState?.overall === 'very_positive' ? 1 : 0,
        engagementLevel: state.turns.length > 10 ? 'high' : state.turns.length > 5 ? 'medium' : 'low',
        communicationMatch: true, // Placeholder
        accessibilityCompliance: true // Placeholder
      },
      aiPerformance: {
        intentRecognitionAccuracy: 0.85, // Placeholder
        entityExtractionAccuracy: 0.80, // Placeholder
        responseRelevance: 0.90, // Placeholder
        contextMaintenance: 0.85, // Placeholder
        escalationAppropriate: state.escalationFlags.length > 0,
        knowledgeGaps: [] // Would identify topics where AI struggled
      }
    };
  }

  private async saveConversationAnalytics(
    conversationId: string,
    analytics: ConversationAnalytics
  ): Promise<void> {
    try {
      const key = `voice-agent:analytics:${conversationId}`;
      await this.redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(analytics)); // 30 days
    } catch (error) {
      logger.error('Failed to save conversation analytics', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length < 4) return phoneNumber;
    return `***-***-${phoneNumber.slice(-4)}`;
  }

  /**
   * Public utility methods
   */

  async getActiveConversationsCount(): Promise<number> {
    const keys = await this.redis.keys('voice-agent:conversation:*');
    return keys.length;
  }

  async getConversationAnalytics(conversationId: string): Promise<ConversationAnalytics | null> {
    try {
      const data = await this.redis.get(`voice-agent:analytics:${conversationId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get conversation analytics', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  async listActiveConversations(): Promise<ConversationState[]> {
    const keys = await this.redis.keys('voice-agent:conversation:*');
    const conversations: ConversationState[] = [];

    for (const key of keys) {
      const conversationId = key.replace('voice-agent:conversation:', '');
      const state = await this.getConversationState(conversationId);
      if (state && state.status === ConversationStatus.ACTIVE) {
        conversations.push(state);
      }
    }

    return conversations;
  }
}