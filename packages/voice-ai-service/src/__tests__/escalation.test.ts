import {
  EscalationTrigger,
  EscalationPriority,
  EscalationStatus,
  EscalationContext,
  EscalationConfig,
  ESCALATION_THRESHOLDS
} from '@ai-voice-agent/shared-utils';

import { EscalationDetector } from '../services/escalation/escalationDetector';
import { ConversationContextManager } from '../services/conversation/contextManager';
import { EscalationRepository } from '../repositories/escalationRepository';

describe('Escalation System Tests', () => {
  let detector: EscalationDetector;
  let contextManager: ConversationContextManager;
  let repository: EscalationRepository;
  let testConfig: EscalationConfig;

  beforeEach(() => {
    testConfig = {
      emotionalDistressThreshold: ESCALATION_THRESHOLDS.EMOTIONAL_DISTRESS_SCORE,
      frustrationThreshold: -0.5,
      misunderstandingLimit: ESCALATION_THRESHOLDS.MISUNDERSTANDING_LIMIT,
      verificationAttemptLimit: ESCALATION_THRESHOLDS.VERIFICATION_ATTEMPT_LIMIT,
      conversationTimeoutMinutes: ESCALATION_THRESHOLDS.CONVERSATION_TIMEOUT_MINUTES,
      escalationKeywords: ['human', 'person', 'operator'],
      medicalComplexityKeywords: ['surgery', 'specialist', 'insurance'],
      priorityRules: []
    };

    detector = new EscalationDetector(testConfig);
    contextManager = new ConversationContextManager();
    repository = new EscalationRepository();
  });

  describe('EscalationDetector', () => {
    test('should detect emotional distress', async () => {
      const context: EscalationContext = {
        conversationId: 'test-conv-1',
        sessionId: 'test-session-1',
        phoneNumber: '+1234567890',
        transcript: [
          {
            timestamp: new Date(),
            speaker: 'patient',
            text: 'I am so frustrated and upset, I need help urgently',
            sentiment: -0.8,
            emotionalMarkers: ['distress', 'crying']
          }
        ],
        currentIntent: 'help_request',
        previousIntents: [],
        callStartTime: new Date(Date.now() - 60000), // 1 minute ago
        escalationTime: new Date(),
        totalDuration: 60000
      };

      const result = await detector.detectEscalation(context);

      expect(result.shouldEscalate).toBe(true);
      expect(result.trigger).toBe(EscalationTrigger.EMOTIONAL_DISTRESS);
      expect(result.priority).toBe(EscalationPriority.CRITICAL);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should detect explicit human request', async () => {
      const context: EscalationContext = {
        conversationId: 'test-conv-2',
        sessionId: 'test-session-2',
        phoneNumber: '+1234567890',
        transcript: [
          {
            timestamp: new Date(),
            speaker: 'patient',
            text: 'Can I please speak to a real person?',
            sentiment: 0.2
          }
        ],
        currentIntent: 'human_request',
        previousIntents: [],
        callStartTime: new Date(Date.now() - 60000),
        escalationTime: new Date(),
        totalDuration: 60000
      };

      const result = await detector.detectEscalation(context);

      expect(result.shouldEscalate).toBe(true);
      expect(result.trigger).toBe(EscalationTrigger.EXPLICIT_REQUEST);
      expect(result.priority).toBe(EscalationPriority.HIGH);
      expect(result.confidence).toBe(1.0);
    });

    test('should detect repeated misunderstandings', async () => {
      const context: EscalationContext = {
        conversationId: 'test-conv-3',
        sessionId: 'test-session-3',
        phoneNumber: '+1234567890',
        transcript: [],
        currentIntent: undefined,
        previousIntents: [],
        callStartTime: new Date(Date.now() - 60000),
        escalationTime: new Date(),
        totalDuration: 60000,
        misunderstandingCount: 4 // Above threshold
      };

      const result = await detector.detectEscalation(context);

      expect(result.shouldEscalate).toBe(true);
      expect(result.trigger).toBe(EscalationTrigger.REPEATED_MISUNDERSTANDING);
      expect(result.priority).toBe(EscalationPriority.HIGH);
    });

    test('should detect complex medical queries', async () => {
      const context: EscalationContext = {
        conversationId: 'test-conv-4',
        sessionId: 'test-session-4',
        phoneNumber: '+1234567890',
        transcript: [
          {
            timestamp: new Date(),
            speaker: 'patient',
            text: 'I need to see a specialist about my surgery and my insurance is denying coverage',
            sentiment: -0.3
          }
        ],
        currentIntent: 'medical_inquiry',
        previousIntents: [],
        callStartTime: new Date(Date.now() - 60000),
        escalationTime: new Date(),
        totalDuration: 60000
      };

      const result = await detector.detectEscalation(context);

      expect(result.shouldEscalate).toBe(true);
      expect(result.trigger).toBe(EscalationTrigger.COMPLEX_MEDICAL_QUERY);
      expect(result.priority).toBe(EscalationPriority.HIGH);
    });

    test('should not escalate normal conversation', async () => {
      const context: EscalationContext = {
        conversationId: 'test-conv-5',
        sessionId: 'test-session-5',
        phoneNumber: '+1234567890',
        transcript: [
          {
            timestamp: new Date(),
            speaker: 'patient',
            text: 'I would like to schedule an appointment please',
            sentiment: 0.5
          }
        ],
        currentIntent: 'schedule_appointment',
        previousIntents: [],
        callStartTime: new Date(Date.now() - 60000),
        escalationTime: new Date(),
        totalDuration: 60000
      };

      const result = await detector.detectEscalation(context);

      expect(result.shouldEscalate).toBe(false);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('ConversationContextManager', () => {
    test('should create and manage conversation sessions', () => {
      const session = contextManager.createSession(
        'conv-1',
        'session-1',
        '+1234567890',
        'patient-123',
        'John Doe'
      );

      expect(session.conversationId).toBe('conv-1');
      expect(session.sessionId).toBe('session-1');
      expect(session.patientName).toBe('John Doe');
      expect(session.transcript).toHaveLength(0);
    });

    test('should add conversation turns and track intents', () => {
      contextManager.createSession('conv-1', 'session-1', '+1234567890');

      contextManager.addConversationTurn(
        'conv-1',
        'patient',
        'I need to schedule an appointment',
        'schedule_request',
        0.3
      );

      contextManager.addConversationTurn(
        'conv-1',
        'ai',
        'I can help you schedule an appointment. What type of appointment do you need?',
        'schedule_response'
      );

      const context = contextManager.getEscalationContext('conv-1');
      expect(context).toBeTruthy();
      expect(context!.transcript).toHaveLength(2);
      expect(context!.currentIntent).toBe('schedule_request');
    });

    test('should generate conversation summary', () => {
      contextManager.createSession('conv-1', 'session-1', '+1234567890', undefined, 'Jane Smith');

      contextManager.addConversationTurn(
        'conv-1',
        'patient',
        'I need help with my insurance',
        'insurance_inquiry',
        -0.2
      );

      const summary = contextManager.generateConversationSummary('conv-1');
      expect(summary).toContain('Jane Smith');
      expect(summary).toContain('insurance_inquiry');
      expect(summary).toContain('I need help with my insurance');
    });

    test('should track misunderstandings and verification attempts', () => {
      contextManager.createSession('conv-1', 'session-1', '+1234567890');

      contextManager.incrementMisunderstanding('conv-1');
      contextManager.incrementMisunderstanding('conv-1');
      contextManager.incrementVerificationAttempts('conv-1');

      const context = contextManager.getEscalationContext('conv-1');
      expect(context!.misunderstandingCount).toBe(2);
      expect(context!.verificationAttempts).toBe(1);
    });
  });

  describe('EscalationRepository', () => {
    test('should create and retrieve escalations', async () => {
      const escalation = {
        id: 'esc-1',
        conversationId: 'conv-1',
        trigger: EscalationTrigger.EXPLICIT_REQUEST,
        priority: EscalationPriority.HIGH,
        status: EscalationStatus.TRIGGERED,
        context: {
          conversationId: 'conv-1',
          sessionId: 'session-1',
          phoneNumber: '+1234567890',
          transcript: [],
          previousIntents: [],
          callStartTime: new Date(),
          escalationTime: new Date(),
          totalDuration: 0
        },
        triggeredAt: new Date()
      };

      await repository.create(escalation);
      const retrieved = await repository.findById('esc-1');

      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe('esc-1');
      expect(retrieved!.trigger).toBe(EscalationTrigger.EXPLICIT_REQUEST);
    });

    test('should update escalation status', async () => {
      const escalation = {
        id: 'esc-2',
        conversationId: 'conv-2',
        trigger: EscalationTrigger.FRUSTRATION,
        priority: EscalationPriority.NORMAL,
        status: EscalationStatus.TRIGGERED,
        context: {
          conversationId: 'conv-2',
          sessionId: 'session-2',
          phoneNumber: '+1234567890',
          transcript: [],
          previousIntents: [],
          callStartTime: new Date(),
          escalationTime: new Date(),
          totalDuration: 0
        },
        triggeredAt: new Date()
      };

      await repository.create(escalation);
      await repository.update('esc-2', {
        status: EscalationStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: 'staff-1'
      });

      const updated = await repository.findById('esc-2');
      expect(updated!.status).toBe(EscalationStatus.ACKNOWLEDGED);
      expect(updated!.acknowledgedBy).toBe('staff-1');
    });

    test('should find escalations by status', async () => {
      const escalation1 = {
        id: 'esc-3',
        conversationId: 'conv-3',
        trigger: EscalationTrigger.EXPLICIT_REQUEST,
        priority: EscalationPriority.HIGH,
        status: EscalationStatus.TRIGGERED,
        context: {
          conversationId: 'conv-3',
          sessionId: 'session-3',
          phoneNumber: '+1234567890',
          transcript: [],
          previousIntents: [],
          callStartTime: new Date(),
          escalationTime: new Date(),
          totalDuration: 0
        },
        triggeredAt: new Date()
      };

      const escalation2 = {
        id: 'esc-4',
        conversationId: 'conv-4',
        trigger: EscalationTrigger.FRUSTRATION,
        priority: EscalationPriority.NORMAL,
        status: EscalationStatus.RESOLVED,
        context: {
          conversationId: 'conv-4',
          sessionId: 'session-4',
          phoneNumber: '+1234567890',
          transcript: [],
          previousIntents: [],
          callStartTime: new Date(),
          escalationTime: new Date(),
          totalDuration: 0
        },
        triggeredAt: new Date()
      };

      await repository.create(escalation1);
      await repository.create(escalation2);

      const triggered = await repository.findByStatus(EscalationStatus.TRIGGERED);
      const resolved = await repository.findByStatus(EscalationStatus.RESOLVED);

      expect(triggered).toHaveLength(1);
      expect(triggered[0].id).toBe('esc-3');
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('esc-4');
    });

    test('should generate statistics', async () => {
      // Create test escalations with different statuses and triggers
      const testEscalations = [
        {
          id: 'esc-5',
          conversationId: 'conv-5',
          trigger: EscalationTrigger.EXPLICIT_REQUEST,
          priority: EscalationPriority.HIGH,
          status: EscalationStatus.RESOLVED,
          context: {} as any,
          triggeredAt: new Date(Date.now() - 3600000), // 1 hour ago
          acknowledgedAt: new Date(Date.now() - 3000000), // 50 minutes ago
          resolvedAt: new Date(Date.now() - 1800000) // 30 minutes ago
        },
        {
          id: 'esc-6',
          conversationId: 'conv-6',
          trigger: EscalationTrigger.FRUSTRATION,
          priority: EscalationPriority.NORMAL,
          status: EscalationStatus.TRIGGERED,
          context: {} as any,
          triggeredAt: new Date()
        }
      ];

      for (const escalation of testEscalations) {
        await repository.create(escalation);
      }

      const stats = await repository.getStatistics();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.byStatus[EscalationStatus.RESOLVED]).toBeGreaterThanOrEqual(1);
      expect(stats.byStatus[EscalationStatus.TRIGGERED]).toBeGreaterThanOrEqual(1);
      expect(stats.byTrigger[EscalationTrigger.EXPLICIT_REQUEST]).toBeGreaterThanOrEqual(1);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
    });
  });
});

// Integration test for the complete escalation flow
describe('Escalation Integration Tests', () => {
  let detector: EscalationDetector;
  let contextManager: ConversationContextManager;

  beforeEach(() => {
    const config: EscalationConfig = {
      emotionalDistressThreshold: -0.7,
      frustrationThreshold: -0.5,
      misunderstandingLimit: 3,
      verificationAttemptLimit: 3,
      conversationTimeoutMinutes: 30,
      escalationKeywords: ['human', 'person', 'operator'],
      medicalComplexityKeywords: ['surgery', 'specialist'],
      priorityRules: []
    };

    detector = new EscalationDetector(config);
    contextManager = new ConversationContextManager();
  });

  test('should handle complete escalation workflow', async () => {
    // Create conversation session
    const session = contextManager.createSession(
      'integration-test-conv',
      'integration-test-session',
      '+1234567890',
      'patient-123',
      'Test Patient'
    );

    // Add some conversation turns
    contextManager.addConversationTurn(
      'integration-test-conv',
      'patient',
      'I need to schedule an appointment',
      'schedule_request',
      0.3
    );

    contextManager.addConversationTurn(
      'integration-test-conv',
      'ai',
      'I can help with that. What type of appointment?',
      'schedule_response'
    );

    // Patient gets frustrated
    contextManager.addConversationTurn(
      'integration-test-conv',
      'patient',
      'This is ridiculous, I just want to talk to a real person!',
      'escalation_request',
      -0.8,
      ['frustration', 'anger']
    );

    // Get escalation context
    const escalationContext = contextManager.getEscalationContext('integration-test-conv');
    expect(escalationContext).toBeTruthy();

    // Check for escalation triggers
    const detection = await detector.detectEscalation(escalationContext!);
    expect(detection.shouldEscalate).toBe(true);

    // Should trigger on both explicit request and emotional distress
    expect([
      EscalationTrigger.EXPLICIT_REQUEST,
      EscalationTrigger.EMOTIONAL_DISTRESS,
      EscalationTrigger.FRUSTRATION
    ]).toContain(detection.trigger);

    // Generate handoff summary
    const summary = contextManager.generateConversationSummary('integration-test-conv');
    expect(summary).toContain('Test Patient');
    expect(summary).toContain('ridiculous');
    expect(summary).toContain('real person');
  });
});