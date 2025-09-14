import { 
  EscalationEvent,
  EscalationStatus,
  EscalationTrigger,
  EscalationPriority 
} from '@ai-voice-agent/shared-utils';
import { createLogger } from '@ai-voice-agent/shared-utils';

const logger = createLogger('escalation-repository');

// Interface for database operations
// This would typically use a real database like PostgreSQL
// For now, implementing in-memory storage with plans for database migration

export class EscalationRepository {
  private escalations: Map<string, EscalationEvent>;
  private indexByConversation: Map<string, string[]>;
  private indexByStatus: Map<EscalationStatus, string[]>;
  private indexByTrigger: Map<EscalationTrigger, string[]>;
  private indexByDate: Map<string, string[]>;

  constructor() {
    this.escalations = new Map();
    this.indexByConversation = new Map();
    this.indexByStatus = new Map();
    this.indexByTrigger = new Map();
    this.indexByDate = new Map();
  }

  /**
   * Create a new escalation record
   */
  public async create(escalation: EscalationEvent): Promise<EscalationEvent> {
    try {
      // Validate required fields
      if (!escalation.id || !escalation.conversationId || !escalation.trigger) {
        throw new Error('Missing required escalation fields');
      }

      // Store the escalation
      this.escalations.set(escalation.id, { ...escalation });

      // Update indexes
      this.updateIndexes(escalation, 'create');

      logger.info('Escalation created', {
        escalationId: escalation.id,
        conversationId: escalation.conversationId,
        trigger: escalation.trigger,
        priority: escalation.priority
      });

      return escalation;
    } catch (error) {
      logger.error('Error creating escalation', {
        escalationId: escalation.id,
        error
      });
      throw error;
    }
  }

  /**
   * Find escalation by ID
   */
  public async findById(escalationId: string): Promise<EscalationEvent | null> {
    try {
      const escalation = this.escalations.get(escalationId);
      return escalation || null;
    } catch (error) {
      logger.error('Error finding escalation by ID', {
        escalationId,
        error
      });
      return null;
    }
  }

  /**
   * Find escalations by conversation ID
   */
  public async findByConversationId(conversationId: string): Promise<EscalationEvent[]> {
    try {
      const escalationIds = this.indexByConversation.get(conversationId) || [];
      return escalationIds
        .map(id => this.escalations.get(id))
        .filter(e => e !== undefined) as EscalationEvent[];
    } catch (error) {
      logger.error('Error finding escalations by conversation ID', {
        conversationId,
        error
      });
      return [];
    }
  }

  /**
   * Find escalations by status
   */
  public async findByStatus(status: EscalationStatus): Promise<EscalationEvent[]> {
    try {
      const escalationIds = this.indexByStatus.get(status) || [];
      return escalationIds
        .map(id => this.escalations.get(id))
        .filter(e => e !== undefined) as EscalationEvent[];
    } catch (error) {
      logger.error('Error finding escalations by status', {
        status,
        error
      });
      return [];
    }
  }

  /**
   * Find escalations by trigger
   */
  public async findByTrigger(trigger: EscalationTrigger): Promise<EscalationEvent[]> {
    try {
      const escalationIds = this.indexByTrigger.get(trigger) || [];
      return escalationIds
        .map(id => this.escalations.get(id))
        .filter(e => e !== undefined) as EscalationEvent[];
    } catch (error) {
      logger.error('Error finding escalations by trigger', {
        trigger,
        error
      });
      return [];
    }
  }

  /**
   * Find escalations by date range
   */
  public async findByDateRange(startDate: Date, endDate: Date): Promise<EscalationEvent[]> {
    try {
      const results: EscalationEvent[] = [];
      
      for (const escalation of this.escalations.values()) {
        if (escalation.triggeredAt >= startDate && escalation.triggeredAt <= endDate) {
          results.push(escalation);
        }
      }

      // Sort by triggered date
      return results.sort((a, b) => 
        b.triggeredAt.getTime() - a.triggeredAt.getTime()
      );
    } catch (error) {
      logger.error('Error finding escalations by date range', {
        startDate,
        endDate,
        error
      });
      return [];
    }
  }

  /**
   * Update an escalation record
   */
  public async update(escalationId: string, updates: Partial<EscalationEvent>): Promise<EscalationEvent> {
    try {
      const existing = this.escalations.get(escalationId);
      if (!existing) {
        throw new Error(`Escalation ${escalationId} not found`);
      }

      // Get old status for index updates
      const oldStatus = existing.status;

      // Update the record
      const updated = { ...existing, ...updates, id: escalationId };
      this.escalations.set(escalationId, updated);

      // Update indexes if status changed
      if (updates.status && updates.status !== oldStatus) {
        this.updateIndexes(updated, 'update', oldStatus);
      }

      logger.info('Escalation updated', {
        escalationId,
        changes: Object.keys(updates),
        newStatus: updates.status
      });

      return updated;
    } catch (error) {
      logger.error('Error updating escalation', {
        escalationId,
        error
      });
      throw error;
    }
  }

  /**
   * Delete an escalation record
   */
  public async delete(escalationId: string): Promise<boolean> {
    try {
      const existing = this.escalations.get(escalationId);
      if (!existing) {
        return false;
      }

      // Remove from storage
      this.escalations.delete(escalationId);

      // Remove from indexes
      this.updateIndexes(existing, 'delete');

      logger.info('Escalation deleted', { escalationId });
      return true;
    } catch (error) {
      logger.error('Error deleting escalation', {
        escalationId,
        error
      });
      return false;
    }
  }

  /**
   * Get escalation statistics
   */
  public async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byTrigger: Record<string, number>;
    byPriority: Record<string, number>;
    averageResponseTime: number;
    averageResolutionTime: number;
  }> {
    try {
      const stats = {
        total: this.escalations.size,
        byStatus: {} as Record<string, number>,
        byTrigger: {} as Record<string, number>,
        byPriority: {} as Record<string, number>,
        averageResponseTime: 0,
        averageResolutionTime: 0
      };

      let totalResponseTime = 0;
      let totalResolutionTime = 0;
      let responseTimeCount = 0;
      let resolutionTimeCount = 0;

      for (const escalation of this.escalations.values()) {
        // Count by status
        stats.byStatus[escalation.status] = 
          (stats.byStatus[escalation.status] || 0) + 1;

        // Count by trigger
        stats.byTrigger[escalation.trigger] = 
          (stats.byTrigger[escalation.trigger] || 0) + 1;

        // Count by priority
        stats.byPriority[escalation.priority] = 
          (stats.byPriority[escalation.priority] || 0) + 1;

        // Calculate response time
        if (escalation.acknowledgedAt) {
          totalResponseTime += 
            escalation.acknowledgedAt.getTime() - escalation.triggeredAt.getTime();
          responseTimeCount++;
        }

        // Calculate resolution time
        if (escalation.resolvedAt) {
          totalResolutionTime += 
            escalation.resolvedAt.getTime() - escalation.triggeredAt.getTime();
          resolutionTimeCount++;
        }
      }

      stats.averageResponseTime = responseTimeCount > 0 ? 
        totalResponseTime / responseTimeCount : 0;
      stats.averageResolutionTime = resolutionTimeCount > 0 ? 
        totalResolutionTime / resolutionTimeCount : 0;

      return stats;
    } catch (error) {
      logger.error('Error getting escalation statistics', { error });
      throw error;
    }
  }

  /**
   * Find active escalations (not resolved or abandoned)
   */
  public async findActive(): Promise<EscalationEvent[]> {
    try {
      const results: EscalationEvent[] = [];
      
      for (const escalation of this.escalations.values()) {
        if (escalation.status !== EscalationStatus.RESOLVED && 
            escalation.status !== EscalationStatus.ABANDONED) {
          results.push(escalation);
        }
      }

      // Sort by priority and then by triggered time
      return results.sort((a, b) => {
        const priorityOrder = {
          [EscalationPriority.CRITICAL]: 0,
          [EscalationPriority.HIGH]: 1,
          [EscalationPriority.NORMAL]: 2,
          [EscalationPriority.LOW]: 3
        };

        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        return a.triggeredAt.getTime() - b.triggeredAt.getTime();
      });
    } catch (error) {
      logger.error('Error finding active escalations', { error });
      return [];
    }
  }

  /**
   * Archive old escalations
   */
  public async archiveOldEscalations(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let archivedCount = 0;
      const toArchive: string[] = [];

      for (const [id, escalation] of this.escalations.entries()) {
        if (escalation.triggeredAt < cutoffDate && 
            (escalation.status === EscalationStatus.RESOLVED || 
             escalation.status === EscalationStatus.ABANDONED)) {
          toArchive.push(id);
        }
      }

      // In a real implementation, this would move records to an archive table
      // For now, we'll just remove them
      for (const id of toArchive) {
        await this.delete(id);
        archivedCount++;
      }

      logger.info('Archived old escalations', {
        count: archivedCount,
        olderThanDays
      });

      return archivedCount;
    } catch (error) {
      logger.error('Error archiving old escalations', {
        olderThanDays,
        error
      });
      return 0;
    }
  }

  /**
   * Private helper methods
   */

  private updateIndexes(
    escalation: EscalationEvent, 
    operation: 'create' | 'update' | 'delete',
    oldStatus?: EscalationStatus
  ): void {
    const { id, conversationId, status, trigger, triggeredAt } = escalation;
    const dateKey = triggeredAt.toISOString().split('T')[0]; // YYYY-MM-DD

    if (operation === 'create') {
      // Add to conversation index
      if (!this.indexByConversation.has(conversationId)) {
        this.indexByConversation.set(conversationId, []);
      }
      this.indexByConversation.get(conversationId)!.push(id);

      // Add to status index
      if (!this.indexByStatus.has(status)) {
        this.indexByStatus.set(status, []);
      }
      this.indexByStatus.get(status)!.push(id);

      // Add to trigger index
      if (!this.indexByTrigger.has(trigger)) {
        this.indexByTrigger.set(trigger, []);
      }
      this.indexByTrigger.get(trigger)!.push(id);

      // Add to date index
      if (!this.indexByDate.has(dateKey)) {
        this.indexByDate.set(dateKey, []);
      }
      this.indexByDate.get(dateKey)!.push(id);

    } else if (operation === 'update' && oldStatus && oldStatus !== status) {
      // Remove from old status index
      const oldStatusIds = this.indexByStatus.get(oldStatus);
      if (oldStatusIds) {
        const index = oldStatusIds.indexOf(id);
        if (index > -1) {
          oldStatusIds.splice(index, 1);
        }
      }

      // Add to new status index
      if (!this.indexByStatus.has(status)) {
        this.indexByStatus.set(status, []);
      }
      this.indexByStatus.get(status)!.push(id);

    } else if (operation === 'delete') {
      // Remove from all indexes
      
      // Conversation index
      const conversationIds = this.indexByConversation.get(conversationId);
      if (conversationIds) {
        const index = conversationIds.indexOf(id);
        if (index > -1) {
          conversationIds.splice(index, 1);
        }
      }

      // Status index
      const statusIds = this.indexByStatus.get(status);
      if (statusIds) {
        const index = statusIds.indexOf(id);
        if (index > -1) {
          statusIds.splice(index, 1);
        }
      }

      // Trigger index
      const triggerIds = this.indexByTrigger.get(trigger);
      if (triggerIds) {
        const index = triggerIds.indexOf(id);
        if (index > -1) {
          triggerIds.splice(index, 1);
        }
      }

      // Date index
      const dateIds = this.indexByDate.get(dateKey);
      if (dateIds) {
        const index = dateIds.indexOf(id);
        if (index > -1) {
          dateIds.splice(index, 1);
        }
      }
    }
  }
}