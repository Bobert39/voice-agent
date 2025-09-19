/**
 * Confidence Scoring Service
 * Calculates confidence scores for NLU results and determines escalation needs
 */

import {
  IntentResult,
  ExtractedEntity,
  ConversationContext,
  ConfidenceLevel,
  IntentCategory
} from '../types';
import { CONFIDENCE_THRESHOLDS } from '../config/intents.config';
import { logger } from '../utils/logger';

export interface ConfidenceScore {
  score: number;
  level: ConfidenceLevel;
  requiresEscalation: boolean;
  factors: {
    intentClarity: number;
    entityCompleteness: number;
    contextConsistency: number;
    historicalSuccess: number;
  };
}

export class ConfidenceScoringService {
  private lowConfidenceHistory: Map<string, number> = new Map();

  constructor(
    private thresholds: typeof CONFIDENCE_THRESHOLDS
  ) {}

  /**
   * Calculate comprehensive confidence score
   */
  calculateScore(
    intent: IntentResult,
    entities: ExtractedEntity[],
    context?: ConversationContext
  ): ConfidenceScore {
    // Calculate individual factors
    const intentClarity = this.calculateIntentClarity(intent);
    const entityCompleteness = this.calculateEntityCompleteness(intent.category, entities);
    const contextConsistency = this.calculateContextConsistency(intent, context);
    const historicalSuccess = this.calculateHistoricalSuccess(context?.sessionId || '');

    // Weight the factors
    const weights = {
      intentClarity: 0.4,
      entityCompleteness: 0.3,
      contextConsistency: 0.2,
      historicalSuccess: 0.1
    };

    // Calculate weighted score
    const score =
      intentClarity * weights.intentClarity +
      entityCompleteness * weights.entityCompleteness +
      contextConsistency * weights.contextConsistency +
      historicalSuccess * weights.historicalSuccess;

    // Determine confidence level
    const level = this.determineLevel(score);

    // Check escalation requirements
    const requiresEscalation = this.checkEscalation(
      score,
      level,
      intent.category,
      context?.sessionId
    );

    // Track low confidence for session
    if (level === ConfidenceLevel.LOW && context?.sessionId) {
      const count = this.lowConfidenceHistory.get(context.sessionId) || 0;
      this.lowConfidenceHistory.set(context.sessionId, count + 1);
    }

    logger.debug('Confidence score calculated', {
      score,
      level,
      requiresEscalation,
      factors: {
        intentClarity,
        entityCompleteness,
        contextConsistency,
        historicalSuccess
      }
    });

    return {
      score,
      level,
      requiresEscalation,
      factors: {
        intentClarity,
        entityCompleteness,
        contextConsistency,
        historicalSuccess
      }
    };
  }

  /**
   * Calculate intent clarity score
   */
  private calculateIntentClarity(intent: IntentResult): number {
    // Base score from GPT-4 confidence
    let clarity = intent.confidence;

    // Adjust for unknown intents
    if (intent.category === IntentCategory.UNKNOWN) {
      clarity *= 0.5;
    }

    // Boost for high-confidence intents
    if (intent.confidence > 0.9) {
      clarity = Math.min(1.0, clarity * 1.1);
    }

    return clarity;
  }

  /**
   * Calculate entity completeness score
   */
  private calculateEntityCompleteness(
    category: IntentCategory,
    entities: ExtractedEntity[]
  ): number {
    // Define required entities per intent category
    const requiredEntities: Partial<Record<IntentCategory, string[]>> = {
      [IntentCategory.APPOINTMENT]: ['date', 'time'],
      [IntentCategory.PRESCRIPTION]: ['medication'],
      [IntentCategory.INSURANCE]: ['insurance_carrier']
    };

    const required = requiredEntities[category];
    if (!required || required.length === 0) {
      // No specific entities required
      return 0.9;
    }

    // Check how many required entities were found
    const foundTypes = new Set(entities.map(e => e.type));
    const foundCount = required.filter(type =>
      foundTypes.has(type as any)
    ).length;

    // Calculate completeness ratio
    const completeness = foundCount / required.length;

    // Consider entity confidence
    const avgEntityConfidence = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
      : 0.5;

    return completeness * 0.7 + avgEntityConfidence * 0.3;
  }

  /**
   * Calculate context consistency score
   */
  private calculateContextConsistency(
    intent: IntentResult,
    context?: ConversationContext
  ): number {
    if (!context || context.conversationHistory.length === 0) {
      // No context to compare against
      return 0.8;
    }

    // Check if intent is consistent with recent conversation
    const recentIntents = context.conversationHistory
      .slice(-3)
      .map(turn => turn.intent);

    // If switching topics drastically, lower confidence
    const topicSwitch = this.detectTopicSwitch(
      intent.category,
      recentIntents
    );

    if (topicSwitch) {
      return 0.6;
    }

    // Check for conversation flow consistency
    const flowConsistent = this.checkFlowConsistency(
      intent.category,
      context.lastIntent
    );

    return flowConsistent ? 0.95 : 0.75;
  }

  /**
   * Calculate historical success rate
   */
  private calculateHistoricalSuccess(sessionId: string): number {
    // In production, this would look up historical success rates
    // For now, return a default moderate score

    const lowConfidenceCount = this.lowConfidenceHistory.get(sessionId) || 0;

    if (lowConfidenceCount === 0) {
      return 0.9;
    } else if (lowConfidenceCount < 3) {
      return 0.7;
    } else {
      return 0.5;
    }
  }

  /**
   * Determine confidence level
   */
  private determineLevel(score: number): ConfidenceLevel {
    if (score >= this.thresholds.high) {
      return ConfidenceLevel.HIGH;
    } else if (score >= this.thresholds.medium) {
      return ConfidenceLevel.MEDIUM;
    } else {
      return ConfidenceLevel.LOW;
    }
  }

  /**
   * Check if escalation is required
   */
  private checkEscalation(
    score: number,
    level: ConfidenceLevel,
    category: IntentCategory,
    sessionId?: string
  ): boolean {
    // Emergency always escalates
    if (category === IntentCategory.EMERGENCY) {
      return true;
    }

    // Low confidence escalates
    if (level === ConfidenceLevel.LOW) {
      return true;
    }

    // Check for repeated low confidence
    if (sessionId) {
      const lowCount = this.lowConfidenceHistory.get(sessionId) || 0;
      if (lowCount >= 3) {
        logger.info('Escalation triggered by repeated low confidence', {
          sessionId,
          lowCount
        });
        return true;
      }
    }

    // Sensitive categories with medium confidence
    if (level === ConfidenceLevel.MEDIUM &&
        (category === IntentCategory.PRESCRIPTION ||
         category === IntentCategory.INSURANCE)) {
      return true;
    }

    // Score below escalation threshold
    if (score < this.thresholds.escalation) {
      return true;
    }

    return false;
  }

  /**
   * Detect topic switch in conversation
   */
  private detectTopicSwitch(
    current: IntentCategory,
    recent: IntentCategory[]
  ): boolean {
    if (recent.length === 0) {
      return false;
    }

    // Define related intent groups
    const relatedGroups = [
      [IntentCategory.APPOINTMENT, IntentCategory.PRACTICE_INFO],
      [IntentCategory.INSURANCE, IntentCategory.PRESCRIPTION],
      [IntentCategory.GENERAL, IntentCategory.UNKNOWN]
    ];

    // Check if current intent is in same group as recent
    for (const group of relatedGroups) {
      if (group.includes(current)) {
        const relatedCount = recent.filter(intent =>
          group.includes(intent)
        ).length;

        // If most recent intents are in same group, no switch
        if (relatedCount >= recent.length / 2) {
          return false;
        }
      }
    }

    // Check if completely different from all recent
    const differentCount = recent.filter(intent =>
      intent !== current
    ).length;

    return differentCount === recent.length;
  }

  /**
   * Check conversation flow consistency
   */
  private checkFlowConsistency(
    current: IntentCategory,
    previous?: IntentCategory
  ): boolean {
    if (!previous) {
      return true;
    }

    // Define natural flow transitions
    const naturalFlows: Record<IntentCategory, IntentCategory[]> = {
      [IntentCategory.APPOINTMENT]: [
        IntentCategory.PRACTICE_INFO,
        IntentCategory.INSURANCE
      ],
      [IntentCategory.PRACTICE_INFO]: [
        IntentCategory.APPOINTMENT,
        IntentCategory.GENERAL
      ],
      [IntentCategory.INSURANCE]: [
        IntentCategory.APPOINTMENT,
        IntentCategory.PRESCRIPTION
      ],
      [IntentCategory.PRESCRIPTION]: [
        IntentCategory.INSURANCE,
        IntentCategory.APPOINTMENT
      ],
      [IntentCategory.GENERAL]: Object.values(IntentCategory),
      [IntentCategory.EMERGENCY]: [IntentCategory.EMERGENCY],
      [IntentCategory.UNKNOWN]: Object.values(IntentCategory)
    };

    const allowedTransitions = naturalFlows[previous] || [];
    return allowedTransitions.includes(current);
  }

  /**
   * Reset low confidence history for session
   */
  resetSession(sessionId: string): void {
    this.lowConfidenceHistory.delete(sessionId);
  }

  /**
   * Get session confidence statistics
   */
  getSessionStats(sessionId: string): {
    lowConfidenceCount: number;
    shouldEscalate: boolean;
  } {
    const lowConfidenceCount = this.lowConfidenceHistory.get(sessionId) || 0;

    return {
      lowConfidenceCount,
      shouldEscalate: lowConfidenceCount >= 3
    };
  }
}