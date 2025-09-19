/**
 * Confidence Scoring Service Tests
 */

import { ConfidenceScoringService } from '../../src/services/confidence-scoring-service';
import {
  IntentResult,
  IntentCategory,
  ConfidenceLevel,
  ExtractedEntity,
  EntityType,
  ConversationContext,
  ConversationTurn
} from '../../src/types';
import { CONFIDENCE_THRESHOLDS } from '../../src/config/intents.config';

describe('ConfidenceScoringService', () => {
  let service: ConfidenceScoringService;

  beforeEach(() => {
    service = new ConfidenceScoringService(CONFIDENCE_THRESHOLDS);
  });

  describe('calculateScore', () => {
    it('should calculate high confidence for clear intent with entities', () => {
      const intent: IntentResult = {
        category: IntentCategory.APPOINTMENT,
        intent: 'schedule_appointment',
        confidence: 0.95,
        confidenceLevel: ConfidenceLevel.HIGH,
        requiresEscalation: false
      };

      const entities: ExtractedEntity[] = [
        {
          type: EntityType.DATE,
          value: 'tomorrow',
          confidence: 0.9
        },
        {
          type: EntityType.TIME,
          value: '2pm',
          confidence: 0.85
        }
      ];

      const score = service.calculateScore(intent, entities);

      expect(score.level).toBe(ConfidenceLevel.HIGH);
      expect(score.score).toBeGreaterThan(0.8);
      expect(score.requiresEscalation).toBe(false);
    });

    it('should calculate low confidence for unknown intent', () => {
      const intent: IntentResult = {
        category: IntentCategory.UNKNOWN,
        intent: 'unknown',
        confidence: 0.3,
        confidenceLevel: ConfidenceLevel.LOW,
        requiresEscalation: true
      };

      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities);

      expect(score.level).toBe(ConfidenceLevel.LOW);
      expect(score.score).toBeLessThan(0.6);
      expect(score.requiresEscalation).toBe(true);
    });

    it('should consider entity completeness', () => {
      const intent: IntentResult = {
        category: IntentCategory.APPOINTMENT,
        intent: 'schedule_appointment',
        confidence: 0.8,
        confidenceLevel: ConfidenceLevel.HIGH,
        requiresEscalation: false
      };

      // Missing required entities for appointment
      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities);

      // Should have lower score due to missing entities
      expect(score.factors.entityCompleteness).toBeLessThan(0.5);
    });

    it('should consider context consistency', () => {
      const intent: IntentResult = {
        category: IntentCategory.APPOINTMENT,
        intent: 'schedule_appointment',
        confidence: 0.85,
        confidenceLevel: ConfidenceLevel.HIGH,
        requiresEscalation: false
      };

      const context: ConversationContext = {
        sessionId: 'test-session',
        patientVerified: true,
        patientId: 'patient-123',
        conversationHistory: [
          {
            timestamp: new Date().toISOString(),
            intent: IntentCategory.APPOINTMENT,
            entities: []
          },
          {
            timestamp: new Date().toISOString(),
            intent: IntentCategory.APPOINTMENT,
            entities: []
          }
        ],
        lastIntent: IntentCategory.APPOINTMENT,
        contextTimeout: 900
      };

      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities, context);

      // Should have high context consistency
      expect(score.factors.contextConsistency).toBeGreaterThan(0.8);
    });

    it('should detect topic switches', () => {
      const intent: IntentResult = {
        category: IntentCategory.PRESCRIPTION,
        intent: 'refill_medication',
        confidence: 0.8,
        confidenceLevel: ConfidenceLevel.HIGH,
        requiresEscalation: false
      };

      const context: ConversationContext = {
        sessionId: 'test-session',
        patientVerified: true,
        conversationHistory: [
          {
            timestamp: new Date().toISOString(),
            intent: IntentCategory.APPOINTMENT,
            entities: []
          },
          {
            timestamp: new Date().toISOString(),
            intent: IntentCategory.APPOINTMENT,
            entities: []
          },
          {
            timestamp: new Date().toISOString(),
            intent: IntentCategory.APPOINTMENT,
            entities: []
          }
        ],
        lastIntent: IntentCategory.APPOINTMENT,
        contextTimeout: 900
      };

      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities, context);

      // Should have lower context consistency due to topic switch
      expect(score.factors.contextConsistency).toBeLessThan(0.7);
    });

    it('should escalate emergency intents', () => {
      const intent: IntentResult = {
        category: IntentCategory.EMERGENCY,
        intent: 'eye_emergency',
        confidence: 0.9,
        confidenceLevel: ConfidenceLevel.HIGH,
        requiresEscalation: true
      };

      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities);

      expect(score.requiresEscalation).toBe(true);
    });

    it('should track repeated low confidence', () => {
      const sessionId = 'test-session';
      const lowConfidenceIntent: IntentResult = {
        category: IntentCategory.GENERAL,
        intent: 'unclear',
        confidence: 0.4,
        confidenceLevel: ConfidenceLevel.LOW,
        requiresEscalation: false
      };

      // Simulate multiple low confidence interactions
      for (let i = 0; i < 3; i++) {
        const context: ConversationContext = {
          sessionId,
          patientVerified: false,
          conversationHistory: [],
          contextTimeout: 900
        };

        service.calculateScore(lowConfidenceIntent, [], context);
      }

      const stats = service.getSessionStats(sessionId);
      expect(stats.lowConfidenceCount).toBe(3);
      expect(stats.shouldEscalate).toBe(true);
    });

    it('should escalate sensitive categories with medium confidence', () => {
      const intent: IntentResult = {
        category: IntentCategory.PRESCRIPTION,
        intent: 'medication_question',
        confidence: 0.65,
        confidenceLevel: ConfidenceLevel.MEDIUM,
        requiresEscalation: false
      };

      const entities: ExtractedEntity[] = [];

      const score = service.calculateScore(intent, entities);

      // Prescription with medium confidence should escalate
      expect(score.requiresEscalation).toBe(true);
    });
  });

  describe('getSessionStats', () => {
    it('should return correct session statistics', () => {
      const sessionId = 'test-session';

      // Initially no low confidence
      let stats = service.getSessionStats(sessionId);
      expect(stats.lowConfidenceCount).toBe(0);
      expect(stats.shouldEscalate).toBe(false);

      // Add low confidence interaction
      const lowIntent: IntentResult = {
        category: IntentCategory.UNKNOWN,
        intent: 'unknown',
        confidence: 0.3,
        confidenceLevel: ConfidenceLevel.LOW,
        requiresEscalation: true
      };

      const context: ConversationContext = {
        sessionId,
        patientVerified: false,
        conversationHistory: [],
        contextTimeout: 900
      };

      service.calculateScore(lowIntent, [], context);

      stats = service.getSessionStats(sessionId);
      expect(stats.lowConfidenceCount).toBe(1);
      expect(stats.shouldEscalate).toBe(false);
    });
  });

  describe('resetSession', () => {
    it('should reset session history', () => {
      const sessionId = 'test-session';

      // Add low confidence
      const lowIntent: IntentResult = {
        category: IntentCategory.UNKNOWN,
        intent: 'unknown',
        confidence: 0.3,
        confidenceLevel: ConfidenceLevel.LOW,
        requiresEscalation: true
      };

      const context: ConversationContext = {
        sessionId,
        patientVerified: false,
        conversationHistory: [],
        contextTimeout: 900
      };

      service.calculateScore(lowIntent, [], context);

      // Reset session
      service.resetSession(sessionId);

      const stats = service.getSessionStats(sessionId);
      expect(stats.lowConfidenceCount).toBe(0);
    });
  });
});