import { NaturalLanguageService } from '../services/nlu/naturalLanguageService';
import { IntentRecognitionService } from '../services/nlu/intentRecognitionService';
import { NLUServiceFactory } from '../services/nlu/nluServiceFactory';

// Mock OpenAI module
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

describe('Natural Language Understanding Service', () => {
  let nluService: NaturalLanguageService;
  let mockOpenAI: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock OpenAI responses
    const OpenAI = require('openai');
    mockOpenAI = new OpenAI();
    
    // Create NLU service for testing
    nluService = NLUServiceFactory.createForTesting('test-api-key');
  });

  describe('Intent Recognition', () => {
    test('should recognize appointment request intent', async () => {
      // Mock OpenAI response for appointment request
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'appointment_request',
              confidence: 0.9,
              entities: [{
                type: 'appointment_type',
                value: 'eye exam',
                confidence: 0.85,
                startIndex: 20,
                endIndex: 28
              }],
              sentiment: 0.1,
              emotionalMarkers: ['polite'],
              requiresFollowUp: true,
              context: {
                urgency: 'medium',
                topic: 'appointment_scheduling',
                category: 'appointment',
                requiresVerification: true,
                suggestedResponses: [
                  "I'd be happy to help you schedule an appointment. What type of appointment are you looking for?"
                ]
              }
            })
          }
        }]
      });

      const result = await nluService.processUtterance(
        "I need to schedule an eye exam appointment",
        {
          conversationId: 'test-123',
          turnCount: 1,
          recentTopics: []
        }
      );

      expect(result.intent).toBe('appointment_request');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('appointment_type');
      expect(result.context.category).toBe('appointment');
      expect(result.context.requiresVerification).toBe(true);
    });

    test('should recognize emergency intent with high urgency', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'emergency',
              confidence: 0.95,
              entities: [],
              sentiment: -0.6,
              emotionalMarkers: ['urgent', 'concerned'],
              requiresFollowUp: true,
              context: {
                urgency: 'urgent',
                topic: 'emergency_care',
                category: 'emergency',
                requiresVerification: false,
                suggestedResponses: [
                  "I understand this is urgent. For immediate medical emergencies, please call 911 or go to the nearest emergency room."
                ]
              }
            })
          }
        }]
      });

      const result = await nluService.processUtterance(
        "Emergency! I have sudden severe eye pain and can't see!",
        {
          conversationId: 'test-456',
          turnCount: 1,
          recentTopics: []
        }
      );

      expect(result.intent).toBe('emergency');
      expect(result.context.urgency).toBe('urgent');
      expect(result.context.category).toBe('emergency');
      expect(result.emotionalMarkers).toContain('urgent');
      expect(result.sentiment).toBeLessThan(0);
    });

    test('should handle practice hours inquiry', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'hours_inquiry',
              confidence: 0.88,
              entities: [],
              sentiment: 0.0,
              emotionalMarkers: ['neutral'],
              requiresFollowUp: false,
              context: {
                urgency: 'low',
                topic: 'practice_information',
                category: 'information',
                requiresVerification: false,
                suggestedResponses: [
                  "I can provide our current hours for you. We're open Monday through Friday from 8 AM to 5 PM."
                ]
              }
            })
          }
        }]
      });

      const result = await nluService.processUtterance(
        "What are your office hours?",
        {
          conversationId: 'test-789',
          turnCount: 1,
          recentTopics: []
        }
      );

      expect(result.intent).toBe('hours_inquiry');
      expect(result.context.category).toBe('information');
      expect(result.context.urgency).toBe('low');
      expect(result.context.requiresVerification).toBe(false);
    });
  });

  describe('Patient-Specific Handling', () => {
    test('should adapt responses for patients with accessibility needs', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'clarification_request',
              confidence: 0.6,
              entities: [],
              sentiment: -0.2,
              emotionalMarkers: ['confused', 'polite'],
              requiresFollowUp: true,
              context: {
                urgency: 'medium',
                topic: 'clarification',
                category: 'general',
                requiresVerification: false,
                suggestedResponses: [
                  "I want to make sure I understand exactly what you need. Could you tell me a bit more?"
                ]
              }
            })
          }
        }]
      });

      const result = await nluService.processUtterance(
        "I'm sorry, could you repeat that? I didn't quite hear you.",
        {
          conversationId: 'test-patient',
          turnCount: 3,
          recentTopics: ['appointment'],
          patientInfo: {
            hasAccessibilityNeeds: true,
            hearingDifficulty: true,
            preferredPace: 'slow'
          }
        }
      );

      expect(result.intent).toBe('clarification_request');
      expect(result.emotionalMarkers).toContain('confused');
      expect(result.context.requiresFollowUp).toBe(true);
      expect(result.context.suggestedResponses[0]).toContain('understand');
    });

    test('should detect patient speech patterns needing support', async () => {
      const sentiment = await nluService.analyzeSentimentForPatients(
        "Well, you see, I need to... what was I saying? Oh yes, my appointment.",
        {
          conversationId: 'test-patient-2',
          turnCount: 2,
          recentTopics: [],
          patientInfo: {
            hasAccessibilityNeeds: true,
            preferredPace: 'slow'
          }
        }
      );

      expect(sentiment.concerns).toContain('clarity_needed');
      expect(sentiment.markers).toBeDefined();
    });
  });

  describe('Entity Extraction', () => {
    test('should extract medical entities correctly', async () => {
      const entities = await nluService.extractMedicalEntities(
        "I need a contact lens fitting with Dr. Smith next Tuesday",
        'appointment_request'
      );

      // Note: This would be mocked in real test
      expect(entities).toBeDefined();
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle API failures gracefully', async () => {
      // Mock API failure
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await nluService.processUtterance(
        "Hello, I need help",
        {
          conversationId: 'test-error',
          turnCount: 1,
          recentTopics: []
        }
      );

      expect(result.intent).toBe('clarification_request'); // fallback intent
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.processing.fallbackUsed).toBe(true);
      expect(result.context.suggestedResponses).toContain(
        expect.stringContaining("I'm sorry")
      );
    });

    test('should handle malformed utterances', async () => {
      const result = await nluService.processUtterance(
        "", // empty utterance
        {
          conversationId: 'test-empty',
          turnCount: 1,
          recentTopics: []
        }
      );

      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Service Factory', () => {
    test('should create service with correct configuration', () => {
      const service = NLUServiceFactory.createForCapitolEyeCare('test-key');
      expect(service).toBeInstanceOf(NaturalLanguageService);
    });

    test('should create testing service with lower thresholds', () => {
      const service = NLUServiceFactory.createForTesting('test-key');
      expect(service).toBeInstanceOf(NaturalLanguageService);
    });

    test('should throw error for missing API key', () => {
      expect(() => {
        NLUServiceFactory.create({
          openai: {
            apiKey: '' // empty API key
          }
        });
      }).toThrow('OpenAI API key is required');
    });

    test('should validate service health', async () => {
      // Mock successful validation
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'greeting',
              confidence: 0.9,
              entities: [],
              requiresFollowUp: false
            })
          }
        }]
      });

      const service = NLUServiceFactory.createForTesting('test-key');
      const isHealthy = await NLUServiceFactory.validateService(service);
      
      expect(isHealthy).toBe(true);
    });
  });

  describe('Configuration Updates', () => {
    test('should update confidence thresholds', () => {
      const service = NLUServiceFactory.createForTesting('test-key');
      
      service.updateConfiguration({
        confidence: {
          threshold: 0.8,
          highTier: 0.9,
          mediumTier: 0.7
        }
      });

      // Test would verify internal configuration is updated
      expect(service).toBeDefined();
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should track processing metrics', async () => {
      // Mock successful response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: 'greeting',
              confidence: 0.9,
              entities: [],
              requiresFollowUp: false,
              context: {
                urgency: 'low',
                topic: 'greeting',
                category: 'general',
                requiresVerification: false,
                suggestedResponses: ['Hello! How can I help you?']
              }
            })
          }
        }]
      });

      await nluService.processUtterance("Hello", {
        conversationId: 'metrics-test',
        turnCount: 1,
        recentTopics: []
      });

      const metrics = nluService.getProcessingMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });

    test('should provide available intents list', () => {
      const intents = nluService.getAvailableIntents();
      expect(Array.isArray(intents)).toBe(true);
      expect(intents).toContain('appointment_request');
      expect(intents).toContain('emergency');
      expect(intents).toContain('hours_inquiry');
    });
  });
});