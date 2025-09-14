import { EscalationConfig, ESCALATION_THRESHOLDS } from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { EscalationDetector } from './escalationDetector';
import { EscalationManager } from './escalationManager';
import { NotificationService } from '../notification/notificationService';
import { ConversationContextManager } from '../conversation/contextManager';
import { EscalationRepository } from '../../repositories/escalationRepository';

const logger = createLogger('escalation-service-init');

// Default configuration for escalation detection
const defaultEscalationConfig: EscalationConfig = {
  emotionalDistressThreshold: ESCALATION_THRESHOLDS.EMOTIONAL_DISTRESS_SCORE,
  frustrationThreshold: -0.5,
  misunderstandingLimit: ESCALATION_THRESHOLDS.MISUNDERSTANDING_LIMIT,
  verificationAttemptLimit: ESCALATION_THRESHOLDS.VERIFICATION_ATTEMPT_LIMIT,
  conversationTimeoutMinutes: ESCALATION_THRESHOLDS.CONVERSATION_TIMEOUT_MINUTES,
  
  escalationKeywords: [
    'speak to human', 'talk to person', 'real person', 'operator', 
    'representative', 'manager', 'supervisor', 'transfer me', 
    'get me someone', 'human please'
  ],
  
  medicalComplexityKeywords: [
    'surgery', 'procedure', 'specialist', 'referral', 'insurance denial',
    'pre-authorization', 'appeal', 'second opinion', 'diagnosis', 
    'test results', 'medication interaction', 'side effects'
  ],
  
  priorityRules: [
    {
      conditions: {
        trigger: ['EMOTIONAL_DISTRESS', 'AI_SERVICE_FAILURE'],
        timeOfDay: { start: '17:00', end: '09:00' } // After hours
      },
      priority: 'CRITICAL'
    },
    {
      conditions: {
        trigger: ['COMPLEX_MEDICAL_QUERY', 'BILLING_ISSUE'],
        patientAge: { min: 65 } // Elderly patients get higher priority
      },
      priority: 'HIGH'
    }
  ]
};

export class EscalationService {
  private detector: EscalationDetector;
  private manager: EscalationManager;
  private notificationService: NotificationService;
  private contextManager: ConversationContextManager;
  private repository: EscalationRepository;

  constructor(config?: Partial<EscalationConfig>) {
    // Initialize components
    const finalConfig = { ...defaultEscalationConfig, ...config };
    
    this.repository = new EscalationRepository();
    this.detector = new EscalationDetector(finalConfig);
    this.contextManager = new ConversationContextManager();
    
    // Initialize notification service on port 8080 (can be configured)
    const notificationPort = process.env.NOTIFICATION_WS_PORT ? 
      parseInt(process.env.NOTIFICATION_WS_PORT) : 8080;
    this.notificationService = new NotificationService(notificationPort);
    
    this.manager = new EscalationManager(
      this.detector,
      this.notificationService,
      this.contextManager,
      this.repository
    );

    logger.info('Escalation service initialized', {
      notificationPort,
      configuredThresholds: {
        emotionalDistress: finalConfig.emotionalDistressThreshold,
        misunderstandingLimit: finalConfig.misunderstandingLimit,
        verificationAttemptLimit: finalConfig.verificationAttemptLimit,
        conversationTimeout: finalConfig.conversationTimeoutMinutes
      }
    });
  }

  /**
   * Get all service components
   */
  public getComponents() {
    return {
      detector: this.detector,
      manager: this.manager,
      notificationService: this.notificationService,
      contextManager: this.contextManager,
      repository: this.repository
    };
  }

  /**
   * Start background services
   */
  public async start(): Promise<void> {
    // Start cleanup job for old escalations
    this.startCleanupJob();
    
    logger.info('Escalation service started');
  }

  /**
   * Stop all services gracefully
   */
  public async stop(): Promise<void> {
    await this.notificationService.shutdown();
    logger.info('Escalation service stopped');
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<EscalationConfig>): void {
    this.detector.updateConfig(config);
    logger.info('Escalation service configuration updated');
  }

  /**
   * Get service health status
   */
  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, boolean>;
    metrics: any;
  } {
    try {
      const conversationStats = this.contextManager.getSessionStats();
      const activeEscalations = this.manager.getActiveEscalations();

      return {
        status: 'healthy',
        components: {
          detector: true,
          manager: true,
          notificationService: true,
          contextManager: true,
          repository: true
        },
        metrics: {
          activeConversations: conversationStats.activeSessions,
          activeEscalations: activeEscalations.length,
          criticalEscalations: activeEscalations.filter(e => e.priority === 'CRITICAL').length,
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        components: {
          detector: false,
          manager: false,
          notificationService: false,
          contextManager: false,
          repository: false
        },
        metrics: {}
      };
    }
  }

  /**
   * Private helper methods
   */

  private startCleanupJob(): void {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        const archivedCount = await this.repository.archiveOldEscalations(7); // Archive after 7 days
        if (archivedCount > 0) {
          logger.info('Archived old escalations', { count: archivedCount });
        }
      } catch (error) {
        logger.error('Error in cleanup job', { error });
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Escalation cleanup job started');
  }
}

// Export factory function
export function createEscalationService(config?: Partial<EscalationConfig>): EscalationService {
  return new EscalationService(config);
}

// Export individual components for direct access
export {
  EscalationDetector,
  EscalationManager,
  NotificationService,
  ConversationContextManager,
  EscalationRepository
};