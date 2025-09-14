import { 
  EscalationContext,
  ConversationTurn,
  EmotionalState
} from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('conversation-context-manager');

interface ConversationSession {
  conversationId: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  phoneNumber: string;
  
  // Conversation state
  transcript: ConversationTurn[];
  currentIntent: string | null;
  previousIntents: string[];
  emotionalState: EmotionalState | null;
  
  // Metadata
  startTime: Date;
  lastActivity: Date;
  totalDuration: number;
  
  // Counters
  misunderstandingCount: number;
  verificationAttempts: number;
  
  // AI context
  conversationSummary?: string;
  keyTopics: string[];
  unfinishedTasks: string[];
  patientGoals: string[];
  
  // Handoff preparation
  handoffSummary?: string;
  urgentFlags: string[];
}

export class ConversationContextManager {
  private sessions: Map<string, ConversationSession>;
  private sessionTimeouts: Map<string, NodeJS.Timeout>;
  private readonly sessionTimeoutMs = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.sessions = new Map();
    this.sessionTimeouts = new Map();
  }

  /**
   * Create a new conversation session
   */
  public createSession(
    conversationId: string,
    sessionId: string,
    phoneNumber: string,
    patientId?: string,
    patientName?: string
  ): ConversationSession {
    const session: ConversationSession = {
      conversationId,
      sessionId,
      patientId,
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
      keyTopics: [],
      unfinishedTasks: [],
      patientGoals: [],
      urgentFlags: []
    };

    this.sessions.set(conversationId, session);
    this.setSessionTimeout(conversationId);

    logger.info('Conversation session created', {
      conversationId,
      sessionId,
      patientId,
      phoneNumber: this.maskPhoneNumber(phoneNumber)
    });

    return session;
  }

  /**
   * Add a conversation turn
   */
  public addConversationTurn(
    conversationId: string,
    speaker: 'patient' | 'ai',
    text: string,
    intent?: string,
    sentiment?: number,
    emotionalMarkers?: string[]
  ): void {
    const session = this.sessions.get(conversationId);
    if (!session) {
      logger.warn('Conversation session not found', { conversationId });
      return;
    }

    const turn: ConversationTurn = {
      timestamp: new Date(),
      speaker,
      text,
      intent,
      sentiment,
      emotionalMarkers
    };

    session.transcript.push(turn);
    session.lastActivity = new Date();
    session.totalDuration = session.lastActivity.getTime() - session.startTime.getTime();

    // Update intent tracking
    if (intent && speaker === 'patient') {
      if (session.currentIntent !== intent) {
        if (session.currentIntent) {
          session.previousIntents.push(session.currentIntent);
        }
        session.currentIntent = intent;
      }
    }

    // Update emotional state if provided
    if (sentiment !== undefined || emotionalMarkers) {
      this.updateEmotionalState(session, sentiment, emotionalMarkers);
    }

    // Extract key topics and tasks
    this.extractKeyInformation(session, turn);

    // Reset session timeout
    this.setSessionTimeout(conversationId);

    logger.debug('Conversation turn added', {
      conversationId,
      speaker,
      intent,
      sentiment,
      transcriptLength: session.transcript.length
    });
  }

  /**
   * Update patient information
   */
  public updatePatientInfo(
    conversationId: string,
    patientId?: string,
    patientName?: string
  ): void {
    const session = this.sessions.get(conversationId);
    if (!session) {
      logger.warn('Conversation session not found', { conversationId });
      return;
    }

    if (patientId) session.patientId = patientId;
    if (patientName) session.patientName = patientName;

    logger.info('Patient information updated', {
      conversationId,
      patientId,
      hasPatientName: !!patientName
    });
  }

  /**
   * Increment counters
   */
  public incrementMisunderstanding(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.misunderstandingCount++;
      logger.debug('Misunderstanding count incremented', {
        conversationId,
        count: session.misunderstandingCount
      });
    }
  }

  public incrementVerificationAttempts(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.verificationAttempts++;
      logger.debug('Verification attempts incremented', {
        conversationId,
        count: session.verificationAttempts
      });
    }
  }

  /**
   * Get escalation context for handoff
   */
  public getEscalationContext(conversationId: string): EscalationContext | null {
    const session = this.sessions.get(conversationId);
    if (!session) {
      logger.warn('Conversation session not found', { conversationId });
      return null;
    }

    // Generate handoff summary if not exists
    if (!session.handoffSummary) {
      session.handoffSummary = this.generateHandoffSummary(session);
    }

    const context: EscalationContext = {
      conversationId: session.conversationId,
      sessionId: session.sessionId,
      patientId: session.patientId,
      patientName: session.patientName,
      phoneNumber: session.phoneNumber,
      transcript: session.transcript,
      currentIntent: session.currentIntent || undefined,
      previousIntents: session.previousIntents,
      callStartTime: session.startTime,
      escalationTime: new Date(),
      totalDuration: session.totalDuration,
      emotionalState: session.emotionalState || undefined,
      verificationAttempts: session.verificationAttempts,
      misunderstandingCount: session.misunderstandingCount
    };

    return context;
  }

  /**
   * Generate human-readable conversation summary
   */
  public generateConversationSummary(conversationId: string): string {
    const session = this.sessions.get(conversationId);
    if (!session) return 'Conversation not found';

    const summary = [
      `Patient: ${session.patientName || 'Unknown'} (${this.maskPhoneNumber(session.phoneNumber)})`,
      `Duration: ${Math.round(session.totalDuration / 1000 / 60)} minutes`,
      `Current Intent: ${session.currentIntent || 'Unknown'}`
    ];

    if (session.keyTopics.length > 0) {
      summary.push(`Key Topics: ${session.keyTopics.join(', ')}`);
    }

    if (session.unfinishedTasks.length > 0) {
      summary.push(`Unfinished Tasks: ${session.unfinishedTasks.join(', ')}`);
    }

    if (session.patientGoals.length > 0) {
      summary.push(`Patient Goals: ${session.patientGoals.join(', ')}`);
    }

    if (session.emotionalState) {
      summary.push(`Emotional State: ${session.emotionalState.overall} (${Math.round(session.emotionalState.confidence * 100)}% confidence)`);
    }

    if (session.urgentFlags.length > 0) {
      summary.push(`⚠️ Urgent Flags: ${session.urgentFlags.join(', ')}`);
    }

    // Add recent context
    const recentTurns = session.transcript.slice(-3);
    if (recentTurns.length > 0) {
      summary.push('\nRecent Conversation:');
      recentTurns.forEach(turn => {
        summary.push(`${turn.speaker === 'patient' ? 'Patient' : 'AI'}: ${turn.text}`);
      });
    }

    return summary.join('\n');
  }

  /**
   * Mark session as handed off
   */
  public markAsHandedOff(conversationId: string, staffId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      // Clear timeout since human is now handling
      this.clearSessionTimeout(conversationId);
      
      logger.info('Conversation handed off to staff', {
        conversationId,
        staffId,
        duration: session.totalDuration
      });
    }
  }

  /**
   * End conversation session
   */
  public endSession(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (session) {
      session.totalDuration = Date.now() - session.startTime.getTime();
      
      logger.info('Conversation session ended', {
        conversationId,
        duration: session.totalDuration,
        transcriptLength: session.transcript.length
      });

      this.clearSessionTimeout(conversationId);
      // Keep session for a short time for potential handoff
      setTimeout(() => {
        this.sessions.delete(conversationId);
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  /**
   * Private helper methods
   */

  private updateEmotionalState(
    session: ConversationSession,
    sentiment?: number,
    emotionalMarkers?: string[]
  ): void {
    if (!session.emotionalState) {
      session.emotionalState = {
        overall: 'neutral',
        confidence: 0,
        markers: [],
        lastUpdated: new Date()
      };
    }

    // Update based on sentiment
    if (sentiment !== undefined) {
      const state = sentiment > 0.3 ? 'positive' : 
                   sentiment < -0.5 ? 'negative' :
                   sentiment < -0.8 ? 'distressed' : 'neutral';
      
      session.emotionalState.overall = state;
      session.emotionalState.confidence = Math.abs(sentiment);
    }

    // Update markers
    if (emotionalMarkers) {
      session.emotionalState.markers.push(...emotionalMarkers);
      // Keep only last 10 markers
      session.emotionalState.markers = session.emotionalState.markers.slice(-10);
    }

    session.emotionalState.lastUpdated = new Date();
  }

  private extractKeyInformation(session: ConversationSession, turn: ConversationTurn): void {
    if (turn.speaker !== 'patient') return;

    const text = turn.text.toLowerCase();

    // Extract key topics
    const medicalKeywords = ['appointment', 'doctor', 'eye exam', 'glasses', 'vision', 'prescription'];
    const billingKeywords = ['insurance', 'cost', 'payment', 'billing', 'copay'];
    const schedulingKeywords = ['schedule', 'reschedule', 'cancel', 'time', 'date'];

    medicalKeywords.forEach(keyword => {
      if (text.includes(keyword) && !session.keyTopics.includes('Medical')) {
        session.keyTopics.push('Medical');
      }
    });

    billingKeywords.forEach(keyword => {
      if (text.includes(keyword) && !session.keyTopics.includes('Billing')) {
        session.keyTopics.push('Billing');
      }
    });

    schedulingKeywords.forEach(keyword => {
      if (text.includes(keyword) && !session.keyTopics.includes('Scheduling')) {
        session.keyTopics.push('Scheduling');
      }
    });

    // Extract goals and tasks
    if (text.includes('need to') || text.includes('want to') || text.includes('trying to')) {
      const goal = turn.text.substring(0, 100); // First 100 chars as goal
      if (!session.patientGoals.some(g => g.includes(goal.substring(0, 20)))) {
        session.patientGoals.push(goal);
      }
    }

    // Flag urgent items
    const urgentKeywords = ['urgent', 'emergency', 'asap', 'right away', 'immediately'];
    urgentKeywords.forEach(keyword => {
      if (text.includes(keyword) && !session.urgentFlags.includes(keyword)) {
        session.urgentFlags.push(`Contains: ${keyword}`);
      }
    });
  }

  private generateHandoffSummary(session: ConversationSession): string {
    const summary = [
      `PATIENT HANDOFF SUMMARY`,
      `Patient: ${session.patientName || 'Unknown'} (${this.maskPhoneNumber(session.phoneNumber)})`,
      `Call Duration: ${Math.round(session.totalDuration / 1000 / 60)} minutes`,
      `Started: ${session.startTime.toLocaleString()}`
    ];

    if (session.currentIntent) {
      summary.push(`Current Need: ${session.currentIntent}`);
    }

    if (session.keyTopics.length > 0) {
      summary.push(`Topics Discussed: ${session.keyTopics.join(', ')}`);
    }

    if (session.patientGoals.length > 0) {
      summary.push(`Patient Goals: ${session.patientGoals.join('; ')}`);
    }

    if (session.emotionalState) {
      summary.push(`Emotional State: ${session.emotionalState.overall} (confidence: ${Math.round(session.emotionalState.confidence * 100)}%)`);
    }

    if (session.misunderstandingCount > 0) {
      summary.push(`⚠️ AI Misunderstandings: ${session.misunderstandingCount}`);
    }

    if (session.verificationAttempts > 0) {
      summary.push(`⚠️ Verification Attempts: ${session.verificationAttempts}`);
    }

    if (session.urgentFlags.length > 0) {
      summary.push(`🚨 URGENT FLAGS: ${session.urgentFlags.join(', ')}`);
    }

    // Add conversation context
    const recentTurns = session.transcript.slice(-5);
    if (recentTurns.length > 0) {
      summary.push('\nRECENT CONVERSATION:');
      recentTurns.forEach(turn => {
        const speaker = turn.speaker === 'patient' ? 'PATIENT' : 'AI';
        summary.push(`${speaker}: ${turn.text}`);
      });
    }

    return summary.join('\n');
  }

  private setSessionTimeout(conversationId: string): void {
    // Clear existing timeout
    this.clearSessionTimeout(conversationId);

    // Set new timeout
    const timeout = setTimeout(() => {
      logger.info('Conversation session timed out', { conversationId });
      this.endSession(conversationId);
    }, this.sessionTimeoutMs);

    this.sessionTimeouts.set(conversationId, timeout);
  }

  private clearSessionTimeout(conversationId: string): void {
    const timeout = this.sessionTimeouts.get(conversationId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(conversationId);
    }
  }

  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length < 4) return phoneNumber;
    return `***-***-${phoneNumber.slice(-4)}`;
  }

  /**
   * Get session statistics
   */
  public getSessionStats(): {
    activeSessions: number;
    totalConversations: number;
    averageDuration: number;
    sessionsWithEscalationFlags: number;
  } {
    const activeSessions = this.sessions.size;
    let totalDuration = 0;
    let escalationFlagged = 0;

    for (const session of this.sessions.values()) {
      totalDuration += session.totalDuration;
      
      if (session.misunderstandingCount > 2 || 
          session.verificationAttempts > 2 ||
          session.urgentFlags.length > 0 ||
          (session.emotionalState?.overall === 'negative' || session.emotionalState?.overall === 'distressed')) {
        escalationFlagged++;
      }
    }

    return {
      activeSessions,
      totalConversations: activeSessions,
      averageDuration: activeSessions > 0 ? totalDuration / activeSessions : 0,
      sessionsWithEscalationFlags: escalationFlagged
    };
  }
}