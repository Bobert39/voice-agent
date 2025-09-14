import { 
  EscalationTrigger, 
  EscalationPriority, 
  ConversationTurn,
  EmotionalState,
  EscalationContext,
  EscalationConfig
} from '@ai-voice-agent/shared-utils';
import { ESCALATION_THRESHOLDS } from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('escalation-detector');

export class EscalationDetector {
  private config: EscalationConfig;
  
  // Keywords that indicate frustration or distress
  private readonly frustrationKeywords = [
    'frustrated', 'annoying', 'ridiculous', 'stupid', 'terrible',
    'awful', 'horrible', 'useless', 'waste of time', 'fed up',
    'can\'t understand', 'not working', 'broken'
  ];
  
  // Keywords that indicate emotional distress
  private readonly distressKeywords = [
    'help me', 'emergency', 'urgent', 'scared', 'worried',
    'anxious', 'crying', 'pain', 'hurt', 'can\'t breathe',
    'chest pain', 'dizzy', 'confused', 'lost'
  ];
  
  // Keywords that indicate explicit escalation request
  private readonly escalationKeywords = [
    'speak to human', 'talk to person', 'real person',
    'operator', 'representative', 'manager', 'supervisor',
    'transfer me', 'get me someone', 'human please'
  ];
  
  // Medical complexity keywords
  private readonly medicalComplexityKeywords = [
    'surgery', 'procedure', 'specialist', 'referral',
    'insurance denial', 'pre-authorization', 'appeal',
    'second opinion', 'diagnosis', 'test results',
    'medication interaction', 'side effects'
  ];

  constructor(config: EscalationConfig) {
    this.config = config;
  }

  /**
   * Analyze conversation for escalation triggers
   */
  public async detectEscalation(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    const checks = await Promise.all([
      this.checkEmotionalDistress(context),
      this.checkExplicitRequest(context),
      this.checkSystemFailures(context),
      this.checkComplexity(context),
      this.checkFrustration(context)
    ]);

    // Find the highest priority trigger
    const triggered = checks
      .filter(check => check.shouldEscalate)
      .sort((a, b) => this.getPriorityWeight(b.priority!) - this.getPriorityWeight(a.priority!))[0];

    if (triggered) {
      logger.info('Escalation triggered', {
        conversationId: context.conversationId,
        trigger: triggered.trigger,
        priority: triggered.priority,
        reason: triggered.reason
      });
    }

    return triggered || { shouldEscalate: false, confidence: 0 };
  }

  /**
   * Check for emotional distress indicators
   */
  private async checkEmotionalDistress(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    const recentTurns = this.getRecentTurns(context.transcript, 5);
    let distressScore = 0;
    let distressIndicators: string[] = [];

    for (const turn of recentTurns) {
      if (turn.speaker === 'patient') {
        const text = turn.text.toLowerCase();
        
        // Check for distress keywords
        const foundKeywords = this.distressKeywords.filter(keyword => 
          text.includes(keyword)
        );
        distressScore += foundKeywords.length * 0.3;
        distressIndicators.push(...foundKeywords);

        // Check sentiment
        if (turn.sentiment && turn.sentiment < ESCALATION_THRESHOLDS.EMOTIONAL_DISTRESS_SCORE) {
          distressScore += Math.abs(turn.sentiment);
          distressIndicators.push(`negative sentiment: ${turn.sentiment}`);
        }

        // Check emotional markers
        if (turn.emotionalMarkers?.includes('distress') || 
            turn.emotionalMarkers?.includes('crying') ||
            turn.emotionalMarkers?.includes('panic')) {
          distressScore += 0.5;
          distressIndicators.push(...(turn.emotionalMarkers || []));
        }
      }
    }

    const shouldEscalate = distressScore >= 1.0;
    
    return {
      shouldEscalate,
      trigger: shouldEscalate ? EscalationTrigger.EMOTIONAL_DISTRESS : undefined,
      priority: shouldEscalate ? EscalationPriority.CRITICAL : undefined,
      confidence: Math.min(distressScore, 1.0),
      reason: shouldEscalate ? 
        `Emotional distress detected: ${distressIndicators.join(', ')}` : 
        undefined
    };
  }

  /**
   * Check for explicit escalation requests
   */
  private async checkExplicitRequest(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    const recentTurns = this.getRecentTurns(context.transcript, 3);
    
    for (const turn of recentTurns) {
      if (turn.speaker === 'patient') {
        const text = turn.text.toLowerCase();
        const foundKeywords = this.escalationKeywords.filter(keyword => 
          text.includes(keyword)
        );
        
        if (foundKeywords.length > 0) {
          return {
            shouldEscalate: true,
            trigger: EscalationTrigger.EXPLICIT_REQUEST,
            priority: EscalationPriority.HIGH,
            confidence: 1.0,
            reason: `Patient requested human assistance: "${foundKeywords.join(', ')}"`
          };
        }
      }
    }

    return { shouldEscalate: false, confidence: 0 };
  }

  /**
   * Check for system failures
   */
  private async checkSystemFailures(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    // Check for repeated misunderstandings
    if (context.misunderstandingCount && 
        context.misunderstandingCount >= ESCALATION_THRESHOLDS.MISUNDERSTANDING_LIMIT) {
      return {
        shouldEscalate: true,
        trigger: EscalationTrigger.REPEATED_MISUNDERSTANDING,
        priority: EscalationPriority.HIGH,
        confidence: 1.0,
        reason: `Too many misunderstandings: ${context.misunderstandingCount}`
      };
    }

    // Check for verification failures
    if (context.verificationAttempts && 
        context.verificationAttempts >= ESCALATION_THRESHOLDS.VERIFICATION_ATTEMPT_LIMIT) {
      return {
        shouldEscalate: true,
        trigger: EscalationTrigger.VERIFICATION_FAILURE,
        priority: EscalationPriority.HIGH,
        confidence: 1.0,
        reason: `Patient verification failed after ${context.verificationAttempts} attempts`
      };
    }

    // Check for conversation timeout
    const conversationDuration = (Date.now() - context.callStartTime.getTime()) / 1000 / 60;
    if (conversationDuration >= ESCALATION_THRESHOLDS.CONVERSATION_TIMEOUT_MINUTES) {
      return {
        shouldEscalate: true,
        trigger: EscalationTrigger.TIMEOUT,
        priority: EscalationPriority.NORMAL,
        confidence: 1.0,
        reason: `Conversation exceeded ${ESCALATION_THRESHOLDS.CONVERSATION_TIMEOUT_MINUTES} minutes`
      };
    }

    return { shouldEscalate: false, confidence: 0 };
  }

  /**
   * Check for medical complexity
   */
  private async checkComplexity(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    const recentTurns = this.getRecentTurns(context.transcript, 5);
    const complexityIndicators: string[] = [];

    for (const turn of recentTurns) {
      if (turn.speaker === 'patient') {
        const text = turn.text.toLowerCase();
        const foundKeywords = this.medicalComplexityKeywords.filter(keyword => 
          text.includes(keyword)
        );
        complexityIndicators.push(...foundKeywords);
      }
    }

    if (complexityIndicators.length >= 2) {
      return {
        shouldEscalate: true,
        trigger: EscalationTrigger.COMPLEX_MEDICAL_QUERY,
        priority: EscalationPriority.HIGH,
        confidence: Math.min(complexityIndicators.length * 0.3, 1.0),
        reason: `Complex medical query detected: ${complexityIndicators.join(', ')}`
      };
    }

    return { shouldEscalate: false, confidence: 0 };
  }

  /**
   * Check for frustration indicators
   */
  private async checkFrustration(
    context: EscalationContext
  ): Promise<{
    shouldEscalate: boolean;
    trigger?: EscalationTrigger;
    priority?: EscalationPriority;
    confidence: number;
    reason?: string;
  }> {
    const recentTurns = this.getRecentTurns(context.transcript, 5);
    let frustrationScore = 0;
    const frustrationIndicators: string[] = [];

    for (const turn of recentTurns) {
      if (turn.speaker === 'patient') {
        const text = turn.text.toLowerCase();
        
        // Check for frustration keywords
        const foundKeywords = this.frustrationKeywords.filter(keyword => 
          text.includes(keyword)
        );
        frustrationScore += foundKeywords.length * 0.4;
        frustrationIndicators.push(...foundKeywords);

        // Check for repeated questions (sign of frustration)
        const similarPreviousTurns = context.transcript.filter(t => 
          t.speaker === 'patient' && 
          this.calculateSimilarity(t.text, turn.text) > 0.8
        ).length;
        
        if (similarPreviousTurns > 2) {
          frustrationScore += 0.5;
          frustrationIndicators.push('repeated questions');
        }

        // Check sentiment trending negative
        if (turn.sentiment && turn.sentiment < -0.3) {
          frustrationScore += Math.abs(turn.sentiment) * 0.5;
        }
      }
    }

    const shouldEscalate = frustrationScore >= 1.0 || 
                          frustrationIndicators.length >= ESCALATION_THRESHOLDS.FRUSTRATION_KEYWORDS_COUNT;

    return {
      shouldEscalate,
      trigger: shouldEscalate ? EscalationTrigger.FRUSTRATION : undefined,
      priority: shouldEscalate ? EscalationPriority.NORMAL : undefined,
      confidence: Math.min(frustrationScore, 1.0),
      reason: shouldEscalate ? 
        `Frustration detected: ${frustrationIndicators.join(', ')}` : 
        undefined
    };
  }

  /**
   * Get recent conversation turns
   */
  private getRecentTurns(transcript: ConversationTurn[], count: number): ConversationTurn[] {
    return transcript.slice(-count);
  }

  /**
   * Calculate text similarity (simple implementation)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(' ');
    const words2 = text2.toLowerCase().split(' ');
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: EscalationPriority): number {
    const weights = {
      [EscalationPriority.CRITICAL]: 4,
      [EscalationPriority.HIGH]: 3,
      [EscalationPriority.NORMAL]: 2,
      [EscalationPriority.LOW]: 1
    };
    return weights[priority] || 0;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<EscalationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Escalation detector configuration updated');
  }
}