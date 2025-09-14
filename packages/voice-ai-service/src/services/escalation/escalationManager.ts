import { v4 as uuidv4 } from 'uuid';
import { 
  EscalationEvent,
  EscalationStatus,
  EscalationTrigger,
  EscalationPriority,
  EscalationContext,
  StaffNotification,
  QuickAction,
  EscalationMetrics
} from '@ai-voice-agent/shared-utils';
import { ESCALATION_SLA, WS_EVENTS } from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { EscalationDetector } from './escalationDetector';
import { NotificationService } from '../notification/notificationService';
import { ConversationContextManager } from '../conversation/contextManager';
import { EscalationRepository } from '../../repositories/escalationRepository';

const logger = createLogger('escalation-manager');

export class EscalationManager {
  private detector: EscalationDetector;
  private notificationService: NotificationService;
  private contextManager: ConversationContextManager;
  private repository: EscalationRepository;
  private activeEscalations: Map<string, EscalationEvent>;
  private slaTimers: Map<string, NodeJS.Timeout>;

  constructor(
    detector: EscalationDetector,
    notificationService: NotificationService,
    contextManager: ConversationContextManager,
    repository: EscalationRepository
  ) {
    this.detector = detector;
    this.notificationService = notificationService;
    this.contextManager = contextManager;
    this.repository = repository;
    this.activeEscalations = new Map();
    this.slaTimers = new Map();
  }

  /**
   * Process conversation and check for escalation triggers
   */
  public async processConversation(context: EscalationContext): Promise<void> {
    try {
      // Check if already escalated
      if (this.isConversationEscalated(context.conversationId)) {
        logger.debug('Conversation already escalated', { conversationId: context.conversationId });
        return;
      }

      // Detect escalation triggers
      const detection = await this.detector.detectEscalation(context);

      if (detection.shouldEscalate && detection.trigger && detection.priority) {
        await this.triggerEscalation(
          context,
          detection.trigger,
          detection.priority,
          detection.reason
        );
      }
    } catch (error) {
      logger.error('Error processing conversation for escalation', {
        conversationId: context.conversationId,
        error
      });
    }
  }

  /**
   * Manually trigger an escalation
   */
  public async triggerEscalation(
    context: EscalationContext,
    trigger: EscalationTrigger,
    priority: EscalationPriority,
    reason?: string
  ): Promise<EscalationEvent> {
    const escalationId = uuidv4();
    
    const escalation: EscalationEvent = {
      id: escalationId,
      conversationId: context.conversationId,
      trigger,
      priority,
      status: EscalationStatus.TRIGGERED,
      context,
      triggeredAt: new Date(),
      resolution: reason
    };

    // Store escalation
    this.activeEscalations.set(escalationId, escalation);
    await this.repository.create(escalation);

    // Start SLA timer
    this.startSLATimer(escalationId, priority);

    // Notify staff
    await this.notifyStaff(escalation);

    // Log for analytics
    logger.info('Escalation triggered', {
      escalationId,
      conversationId: context.conversationId,
      trigger,
      priority,
      reason
    });

    return escalation;
  }

  /**
   * Acknowledge an escalation
   */
  public async acknowledgeEscalation(
    escalationId: string,
    staffId: string
  ): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    escalation.status = EscalationStatus.ACKNOWLEDGED;
    escalation.acknowledgedAt = new Date();
    escalation.acknowledgedBy = staffId;

    await this.repository.update(escalationId, escalation);

    // Clear SLA timer
    this.clearSLATimer(escalationId);

    // Notify other staff
    await this.notificationService.broadcast(WS_EVENTS.ESCALATION_ACKNOWLEDGED, {
      escalationId,
      staffId,
      acknowledgedAt: escalation.acknowledgedAt
    });

    logger.info('Escalation acknowledged', {
      escalationId,
      staffId,
      responseTime: escalation.acknowledgedAt.getTime() - escalation.triggeredAt.getTime()
    });
  }

  /**
   * Resolve an escalation
   */
  public async resolveEscalation(
    escalationId: string,
    staffId: string,
    resolution: string,
    followUpRequired: boolean = false
  ): Promise<void> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${escalationId} not found`);
    }

    escalation.status = EscalationStatus.RESOLVED;
    escalation.resolvedAt = new Date();
    escalation.resolvedBy = staffId;
    escalation.resolution = resolution;
    escalation.followUpRequired = followUpRequired;

    await this.repository.update(escalationId, escalation);
    this.activeEscalations.delete(escalationId);

    // Clear any timers
    this.clearSLATimer(escalationId);

    // Notify staff
    await this.notificationService.broadcast(WS_EVENTS.ESCALATION_RESOLVED, {
      escalationId,
      staffId,
      resolution,
      resolvedAt: escalation.resolvedAt
    });

    logger.info('Escalation resolved', {
      escalationId,
      staffId,
      resolutionTime: escalation.resolvedAt.getTime() - escalation.triggeredAt.getTime()
    });
  }

  /**
   * Get conversation context for handoff
   */
  public async getHandoffContext(escalationId: string): Promise<EscalationContext> {
    const escalation = this.activeEscalations.get(escalationId);
    if (!escalation) {
      const stored = await this.repository.findById(escalationId);
      if (!stored) {
        throw new Error(`Escalation ${escalationId} not found`);
      }
      return stored.context;
    }
    return escalation.context;
  }

  /**
   * Get active escalations
   */
  public getActiveEscalations(): EscalationEvent[] {
    return Array.from(this.activeEscalations.values());
  }

  /**
   * Get escalation metrics
   */
  public async getMetrics(startDate: Date, endDate: Date): Promise<EscalationMetrics> {
    const escalations = await this.repository.findByDateRange(startDate, endDate);
    
    const metrics: EscalationMetrics = {
      totalEscalations: escalations.length,
      byTrigger: {} as Record<EscalationTrigger, number>,
      byPriority: {} as Record<EscalationPriority, number>,
      averageResponseTime: 0,
      averageResolutionTime: 0,
      abandonmentRate: 0,
      periodStart: startDate,
      periodEnd: endDate
    };

    // Calculate metrics
    let totalResponseTime = 0;
    let totalResolutionTime = 0;
    let acknowledgedCount = 0;
    let resolvedCount = 0;
    let abandonedCount = 0;

    for (const escalation of escalations) {
      // Count by trigger
      metrics.byTrigger[escalation.trigger] = 
        (metrics.byTrigger[escalation.trigger] || 0) + 1;

      // Count by priority
      metrics.byPriority[escalation.priority] = 
        (metrics.byPriority[escalation.priority] || 0) + 1;

      // Response time
      if (escalation.acknowledgedAt) {
        acknowledgedCount++;
        totalResponseTime += 
          escalation.acknowledgedAt.getTime() - escalation.triggeredAt.getTime();
      }

      // Resolution time
      if (escalation.resolvedAt) {
        resolvedCount++;
        totalResolutionTime += 
          escalation.resolvedAt.getTime() - escalation.triggeredAt.getTime();
      }

      // Abandonment
      if (escalation.status === EscalationStatus.ABANDONED) {
        abandonedCount++;
      }
    }

    metrics.averageResponseTime = acknowledgedCount > 0 ? 
      totalResponseTime / acknowledgedCount : 0;
    metrics.averageResolutionTime = resolvedCount > 0 ? 
      totalResolutionTime / resolvedCount : 0;
    metrics.abandonmentRate = escalations.length > 0 ? 
      abandonedCount / escalations.length : 0;

    return metrics;
  }

  /**
   * Private helper methods
   */

  private isConversationEscalated(conversationId: string): boolean {
    return Array.from(this.activeEscalations.values())
      .some(e => e.conversationId === conversationId);
  }

  private async notifyStaff(escalation: EscalationEvent): Promise<void> {
    const department = this.getDepartmentForTrigger(escalation.trigger);
    
    const notification: StaffNotification = {
      escalationId: escalation.id,
      priority: escalation.priority,
      department,
      message: this.generateNotificationMessage(escalation),
      quickActions: this.generateQuickActions(escalation),
      context: escalation.context
    };

    escalation.notifiedAt = new Date();
    await this.repository.update(escalation.id, escalation);

    await this.notificationService.notifyDepartment(
      department,
      WS_EVENTS.ESCALATION_TRIGGERED,
      notification
    );
  }

  private getDepartmentForTrigger(trigger: EscalationTrigger): string {
    const departmentMap: Record<EscalationTrigger, string> = {
      [EscalationTrigger.EMOTIONAL_DISTRESS]: 'medical',
      [EscalationTrigger.FRUSTRATION]: 'reception',
      [EscalationTrigger.ANGER]: 'reception',
      [EscalationTrigger.EXPLICIT_REQUEST]: 'reception',
      [EscalationTrigger.COMPLEX_MEDICAL_QUERY]: 'medical',
      [EscalationTrigger.BILLING_ISSUE]: 'billing',
      [EscalationTrigger.COMPLAINT]: 'reception',
      [EscalationTrigger.AI_SERVICE_FAILURE]: 'technical',
      [EscalationTrigger.REPEATED_MISUNDERSTANDING]: 'reception',
      [EscalationTrigger.VERIFICATION_FAILURE]: 'reception',
      [EscalationTrigger.TIMEOUT]: 'reception'
    };

    return departmentMap[trigger] || 'reception';
  }

  private generateNotificationMessage(escalation: EscalationEvent): string {
    const patientInfo = escalation.context.patientName || 
                       escalation.context.phoneNumber;
    
    const messages: Record<EscalationTrigger, string> = {
      [EscalationTrigger.EMOTIONAL_DISTRESS]: 
        `Patient ${patientInfo} is in emotional distress and needs immediate assistance`,
      [EscalationTrigger.FRUSTRATION]: 
        `Patient ${patientInfo} is frustrated with the automated system`,
      [EscalationTrigger.ANGER]: 
        `Patient ${patientInfo} is angry and requires human intervention`,
      [EscalationTrigger.EXPLICIT_REQUEST]: 
        `Patient ${patientInfo} has requested to speak with a human`,
      [EscalationTrigger.COMPLEX_MEDICAL_QUERY]: 
        `Patient ${patientInfo} has a complex medical question`,
      [EscalationTrigger.BILLING_ISSUE]: 
        `Patient ${patientInfo} has a billing inquiry`,
      [EscalationTrigger.COMPLAINT]: 
        `Patient ${patientInfo} has a complaint to report`,
      [EscalationTrigger.AI_SERVICE_FAILURE]: 
        `Technical issue with AI service for patient ${patientInfo}`,
      [EscalationTrigger.REPEATED_MISUNDERSTANDING]: 
        `AI unable to understand patient ${patientInfo} after multiple attempts`,
      [EscalationTrigger.VERIFICATION_FAILURE]: 
        `Unable to verify patient ${patientInfo}'s identity`,
      [EscalationTrigger.TIMEOUT]: 
        `Long conversation with patient ${patientInfo} requires attention`
    };

    return messages[escalation.trigger] || 
           `Patient ${patientInfo} requires assistance`;
  }

  private generateQuickActions(escalation: EscalationEvent): QuickAction[] {
    return [
      {
        id: 'acknowledge',
        label: 'Accept Call',
        action: 'acknowledge',
        data: { escalationId: escalation.id }
      },
      {
        id: 'transfer',
        label: 'Transfer to Other',
        action: 'transfer',
        data: { escalationId: escalation.id }
      },
      {
        id: 'notes',
        label: 'Add Notes',
        action: 'notes',
        data: { escalationId: escalation.id }
      }
    ];
  }

  private startSLATimer(escalationId: string, priority: EscalationPriority): void {
    const slaTime = ESCALATION_SLA[priority];
    
    const timer = setTimeout(async () => {
      const escalation = this.activeEscalations.get(escalationId);
      if (escalation && escalation.status === EscalationStatus.TRIGGERED) {
        logger.warn('SLA breach for escalation', {
          escalationId,
          priority,
          slaTime
        });

        // Notify about SLA breach
        await this.notificationService.broadcast(WS_EVENTS.ERROR, {
          type: 'SLA_BREACH',
          escalationId,
          priority,
          message: `SLA breached for ${priority} priority escalation`
        });
      }
    }, slaTime);

    this.slaTimers.set(escalationId, timer);
  }

  private clearSLATimer(escalationId: string): void {
    const timer = this.slaTimers.get(escalationId);
    if (timer) {
      clearTimeout(timer);
      this.slaTimers.delete(escalationId);
    }
  }
}