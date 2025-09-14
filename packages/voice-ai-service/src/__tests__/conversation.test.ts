import Redis from 'ioredis';
import { ConversationManager } from '../services/conversation/conversationManager';
import { ConversationFlowHandler } from '../services/conversation/conversationFlowHandler';
import { ConversationContextManager } from '../services/conversation/contextManager';
import { EscalationManager } from '../services/escalation/escalationManager';
import { 
  ConversationStatus, 
  ConversationPhase,
  ConversationTurn 
} from '@ai-voice-agent/shared-utils';

// Mock Redis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

// Mock dependencies
jest.mock('../services/conversation/contextManager');
jest.mock('../services/escalation/escalationManager');

describe('ConversationManager', () => {
  let conversationManager: ConversationManager;
  let mockRedis: jest.Mocked<Redis>;
  let mockContextManager: jest.Mocked<ConversationContextManager>;
  let mockEscalationManager: jest.Mocked<EscalationManager>;

  beforeEach(() => {
    mockRedis = new MockedRedis() as jest.Mocked<Redis>;
    mockContextManager = new ConversationContextManager() as jest.Mocked<ConversationContextManager>;
    mockEscalationManager = {} as jest.Mocked<EscalationManager>;

    const config = {
      redisClient: mockRedis,
      sessionTimeoutSeconds: 1800, // 30 minutes
      warningTimeoutSeconds: [1200, 1500], // 20 and 25 minutes
      gracePeriodSeconds: 300, // 5 minutes
      maxTurnsPerConversation: 50,
      enableAnalytics: true
    };

    conversationManager = new ConversationManager(
      config,
      mockContextManager,
      mockEscalationManager
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startConversation', () => {
    it('should create a new conversation with initial state', async () => {
      const phoneNumber = '+1234567890';
      const patientName = 'John Doe';

      mockRedis.setex.mockResolvedValue('OK');
      mockContextManager.createSession.mockReturnValue({
        conversationId: 'test-id',
        sessionId: 'session-id',
        patientName,
        phoneNumber,
        transcript: [],
        currentIntent: null,
        previousIntents: [],
        emotionalState: null,
        startTime: new Date(),
        lastActivity: new Date(),
        totalDuration: 0,
        misunderstandingCount: 0,
        verificationAttempts: 0,
        conversationSummary: undefined,
        keyTopics: [],
        unfinishedTasks: [],
        patientGoals: [],
        handoffSummary: undefined,
        urgentFlags: []
      });

      const conversation = await conversationManager.startConversation(
        phoneNumber,
        'patient-123',
        patientName
      );

      expect(conversation).toBeDefined();
      expect(conversation.phoneNumber).toBe(phoneNumber);
      expect(conversation.patientName).toBe(patientName);
      expect(conversation.status).toBe(ConversationStatus.INITIATED);
      expect(conversation.turns).toHaveLength(0);
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockContextManager.createSession).toHaveBeenCalledWith(
        conversation.conversationId,
        conversation.sessionId,
        phoneNumber,
        'patient-123',
        patientName
      );
    });
  });

  describe('addTurn', () => {
    it('should add a patient turn and update conversation state', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        sessionId: 'session-123',
        patientId: 'patient-123',
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        status: ConversationStatus.ACTIVE,
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
        verificationStatus: 'unverified' as const,
        verificationAttempts: 0,
        keyInsights: [],
        recommendedActions: [],
        escalationFlags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockState));
      mockRedis.setex.mockResolvedValue('OK');

      const updatedState = await conversationManager.addTurn(
        conversationId,
        'patient',
        'Hello, I need to schedule an appointment',
        {
          intent: 'appointment_request',
          sentiment: 0.1,
          topics: ['appointment', 'scheduling']
        }
      );

      expect(updatedState.turns).toHaveLength(1);
      expect(updatedState.turns[0].speaker).toBe('patient');
      expect(updatedState.turns[0].text).toBe('Hello, I need to schedule an appointment');
      expect(updatedState.turns[0].intent).toBe('appointment_request');
      expect(updatedState.currentIntent).toBe('appointment_request');
      expect(mockContextManager.addConversationTurn).toHaveBeenCalled();
    });

    it('should track intent changes', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        sessionId: 'session-123',
        patientId: 'patient-123',
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        status: ConversationStatus.ACTIVE,
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
        currentIntent: 'hours_inquiry',
        startTime: new Date(),
        lastActivity: new Date(),
        totalDuration: 0,
        misunderstandingCount: 0,
        clarificationRequests: 0,
        topicSwitches: 0,
        verificationStatus: 'unverified' as const,
        verificationAttempts: 0,
        keyInsights: [],
        recommendedActions: [],
        escalationFlags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockState));
      mockRedis.setex.mockResolvedValue('OK');

      const updatedState = await conversationManager.addTurn(
        conversationId,
        'patient',
        'Actually, I want to schedule an appointment',
        {
          intent: 'appointment_request'
        }
      );

      expect(updatedState.intentHistory).toContain('hours_inquiry');
      expect(updatedState.currentIntent).toBe('appointment_request');
    });
  });

  describe('handleTopicChange', () => {
    it('should handle topic changes and track switches', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        sessionId: 'session-123',
        patientId: 'patient-123',
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        status: ConversationStatus.ACTIVE,
        currentTopic: 'hours',
        previousTopics: [],
        contextualMemory: {
          recentTopics: ['hours'],
          mentionedEntities: [],
          userPreferences: {},
          sessionGoals: [],
          discussedTopics: ['hours'],
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
        verificationStatus: 'unverified' as const,
        verificationAttempts: 0,
        keyInsights: [],
        recommendedActions: [],
        escalationFlags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockState));
      mockRedis.setex.mockResolvedValue('OK');

      const updatedState = await conversationManager.handleTopicChange(
        conversationId,
        'appointment',
        'Need to switch to scheduling'
      );

      expect(updatedState.currentTopic).toBe('appointment');
      expect(updatedState.previousTopics).toContain('hours');
      expect(updatedState.topicSwitches).toBe(1);
      expect(updatedState.contextualMemory.recentTopics).toContain('appointment');
    });
  });

  describe('endConversation', () => {
    it('should end conversation naturally with proper cleanup', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        sessionId: 'session-123',
        patientId: 'patient-123',
        patientName: 'John Doe',
        phoneNumber: '+1234567890',
        status: ConversationStatus.ACTIVE,
        previousTopics: [],
        contextualMemory: {
          recentTopics: [],
          mentionedEntities: [],
          userPreferences: {},
          sessionGoals: [],
          discussedTopics: [],
          resolvedIssues: []
        },
        turns: [
          {
            id: 'turn-1',
            timestamp: new Date(),
            speaker: 'patient' as const,
            text: 'Thank you for your help',
            intent: 'goodbye'
          }
        ],
        intentHistory: [],
        conversationGoals: ['Get appointment information'],
        completedGoals: ['Get appointment information'],
        pendingActions: [],
        startTime: new Date(Date.now() - 300000), // 5 minutes ago
        lastActivity: new Date(),
        totalDuration: 300000,
        misunderstandingCount: 0,
        clarificationRequests: 0,
        topicSwitches: 0,
        verificationStatus: 'verified' as const,
        verificationAttempts: 1,
        keyInsights: [],
        recommendedActions: [],
        escalationFlags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 3
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockState));
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.expire.mockResolvedValue(1);

      const finalState = await conversationManager.endConversation(
        conversationId,
        'natural',
        'Patient satisfied',
        'Thank you for calling Capitol Eye Care. Have a great day!'
      );

      expect(finalState.status).toBe(ConversationStatus.ENDED_NATURALLY);
      expect(mockContextManager.endSession).toHaveBeenCalledWith(conversationId);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        `voice-agent:conversation:${conversationId}`,
        7 * 24 * 60 * 60
      );
    });
  });
});

describe('ConversationFlowHandler', () => {
  let flowHandler: ConversationFlowHandler;
  let mockConversationManager: jest.Mocked<ConversationManager>;

  beforeEach(() => {
    mockConversationManager = {
      getConversationState: jest.fn(),
      getConversationContext: jest.fn(),
      handleTopicChange: jest.fn()
    } as any;

    const config = {
      enableSmartTransitions: true,
      contextWindowTurns: 3,
      confidenceThreshold: 0.7,
      enableTopicTracking: true
    };

    flowHandler = new ConversationFlowHandler(mockConversationManager, config);
  });

  describe('processTurn', () => {
    it('should process turn and determine next actions', async () => {
      const conversationId = 'test-conversation';
      const turn: ConversationTurn = {
        id: 'turn-1',
        timestamp: new Date(),
        speaker: 'patient',
        text: 'I need help with my appointment',
        intent: 'appointment_inquiry',
        confidence: 0.9
      };

      const mockState = {
        conversationId,
        status: ConversationStatus.ACTIVE,
        turns: [],
        conversationGoals: [],
        completedGoals: [],
        pendingActions: []
      } as any;

      const mockContext = {
        turnNumber: 1,
        topicContinuity: false,
        requiresClarification: false,
        referencesHistory: false,
        contextualReferences: []
      };

      mockConversationManager.getConversationState.mockResolvedValue(mockState);
      mockConversationManager.getConversationContext.mockResolvedValue(mockContext);

      const result = await flowHandler.processTurn(conversationId, turn);

      expect(result).toBeDefined();
      expect(result.contextPreserved).toBe(false); // First turn
      expect(result.requiresFollowUp).toBe(true); // Appointment inquiry needs follow-up
      expect(result.suggestedResponse).toContain('appointment');
    });
  });

  describe('handleTopicTransition', () => {
    it('should handle topic transitions with bridge messages', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        turns: [
          { text: 'About office hours', topics: ['hours'] },
          { text: 'What about appointments?', topics: ['appointment'] }
        ]
      } as any;

      mockConversationManager.getConversationState.mockResolvedValue(mockState);
      mockConversationManager.handleTopicChange.mockResolvedValue(mockState);

      const result = await flowHandler.handleTopicTransition(
        conversationId,
        'hours',
        'appointment',
        'Patient wants to schedule'
      );

      expect(result).toBeDefined();
      expect(result.bridgeMessage).toBeDefined();
      expect(result.contextLost).toBe(true); // Different topics
      expect(mockConversationManager.handleTopicChange).toHaveBeenCalledWith(
        conversationId,
        'appointment',
        'Patient wants to schedule'
      );
    });
  });

  describe('generateFollowUpQuestion', () => {
    it('should generate contextual follow-up questions', async () => {
      const conversationId = 'test-conversation';
      const mockState = {
        conversationId,
        currentTopic: 'appointment',
        turns: [
          {
            speaker: 'patient',
            text: 'I need an eye exam',
            intent: 'appointment_request'
          }
        ]
      } as any;

      mockConversationManager.getConversationState.mockResolvedValue(mockState);
      mockConversationManager.getConversationContext.mockResolvedValue({
        turnNumber: 1,
        topicContinuity: true,
        requiresClarification: false,
        referencesHistory: false,
        contextualReferences: []
      });

      const question = await flowHandler.generateFollowUpQuestion(
        conversationId,
        'clarification'
      );

      expect(question).toBeDefined();
      expect(question).toContain('appointment');
      expect(question).toContain('type');
    });
  });
});

describe('Multi-turn Conversation Scenarios', () => {
  let conversationManager: ConversationManager;
  let flowHandler: ConversationFlowHandler;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = new MockedRedis() as jest.Mocked<Redis>;
    
    const config = {
      redisClient: mockRedis,
      sessionTimeoutSeconds: 1800,
      warningTimeoutSeconds: [1200, 1500],
      gracePeriodSeconds: 300,
      maxTurnsPerConversation: 50,
      enableAnalytics: true
    };

    conversationManager = new ConversationManager(
      config,
      {} as ConversationContextManager,
      {} as EscalationManager
    );

    flowHandler = new ConversationFlowHandler(conversationManager, {
      enableSmartTransitions: true,
      contextWindowTurns: 3,
      confidenceThreshold: 0.7,
      enableTopicTracking: true
    });
  });

  it('should handle complex multi-turn conversation with topic changes', async () => {
    mockRedis.setex.mockResolvedValue('OK');
    
    // Start conversation
    const conversation = await conversationManager.startConversation(
      '+1234567890',
      'patient-123',
      'Jane Smith'
    );

    // Mock Redis to return updated states
    let conversationState = conversation;
    mockRedis.get.mockImplementation(() => Promise.resolve(JSON.stringify(conversationState)));
    mockRedis.setex.mockImplementation((key, ttl, value) => {
      conversationState = JSON.parse(value);
      return Promise.resolve('OK');
    });

    // Turn 1: Initial greeting
    await conversationManager.addTurn(
      conversation.conversationId,
      'patient',
      'Hello, I have some questions',
      { intent: 'greeting', sentiment: 0.2 }
    );

    // Turn 2: Ask about hours
    await conversationManager.addTurn(
      conversation.conversationId,
      'patient',
      'What are your office hours?',
      { intent: 'hours_inquiry', topics: ['hours'] }
    );

    // Turn 3: AI response
    await conversationManager.addTurn(
      conversation.conversationId,
      'ai',
      'We are open Monday through Friday 8 AM to 5 PM, and Saturday 9 AM to 2 PM.',
      { topics: ['hours'] }
    );

    // Turn 4: Topic change to appointments
    await conversationManager.addTurn(
      conversation.conversationId,
      'patient',
      'Great! Now I also need to schedule an appointment.',
      { 
        intent: 'appointment_request', 
        topics: ['appointment'],
        followUpRequired: true 
      }
    );

    // Verify conversation state after topic change
    const finalState = await conversationManager.getConversationState(conversation.conversationId);
    
    expect(finalState?.turns).toHaveLength(4);
    expect(finalState?.currentIntent).toBe('appointment_request');
    expect(finalState?.intentHistory).toContain('hours_inquiry');
    expect(finalState?.contextualMemory.discussedTopics).toContain('hours');
    expect(finalState?.contextualMemory.discussedTopics).toContain('appointment');
  });

  it('should preserve context across clarification exchanges', async () => {
    mockRedis.setex.mockResolvedValue('OK');
    
    const conversation = await conversationManager.startConversation(
      '+1234567890',
      'patient-456',
      'Bob Johnson'
    );

    let conversationState = conversation;
    mockRedis.get.mockImplementation(() => Promise.resolve(JSON.stringify(conversationState)));
    mockRedis.setex.mockImplementation((key, ttl, value) => {
      conversationState = JSON.parse(value);
      return Promise.resolve('OK');
    });

    // Initial request (unclear)
    await conversationManager.addTurn(
      conversation.conversationId,
      'patient',
      'I need help with my thing',
      { intent: 'unclear_request', sentiment: 0.0 }
    );

    // AI asks for clarification
    await conversationManager.addTurn(
      conversation.conversationId,
      'ai',
      'I want to help you. Could you tell me more about what you need assistance with?',
      { followUpRequired: true }
    );

    // Patient clarifies
    await conversationManager.addTurn(
      conversation.conversationId,
      'patient',
      'I meant my appointment that I scheduled last week',
      { 
        intent: 'appointment_inquiry',
        topics: ['appointment'],
        entities: [
          { type: 'date', value: 'last week', confidence: 0.8, startIndex: 35, endIndex: 44 }
        ]
      }
    );

    const finalState = await conversationManager.getConversationState(conversation.conversationId);
    
    expect(finalState?.turns).toHaveLength(3);
    expect(finalState?.clarificationRequests).toBe(0); // Incremented by flow handler
    expect(finalState?.currentIntent).toBe('appointment_inquiry');
    expect(finalState?.contextualMemory.mentionedEntities).toHaveLength(1);
    expect(finalState?.contextualMemory.mentionedEntities[0].value).toBe('last week');
  });
});