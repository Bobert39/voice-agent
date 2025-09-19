/**
 * Context Manager Service
 * Manages conversation context and state with Redis
 */

import Redis from 'ioredis';
import {
  ConversationContext,
  ConversationTurn,
  IntentCategory,
  ExtractedEntity
} from '../types';
import { logger } from '../utils/logger';

export class ContextManager {
  private redis: Redis;
  private readonly CONTEXT_PREFIX = 'nlu:context:';
  private readonly DEFAULT_TIMEOUT = 900; // 15 minutes in seconds
  private readonly MAX_HISTORY = 10; // Max conversation turns to keep

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error });
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected for context management');
    });
  }

  /**
   * Get conversation context for session
   */
  async getContext(sessionId: string): Promise<ConversationContext | undefined> {
    try {
      const key = `${this.CONTEXT_PREFIX}${sessionId}`;
      const contextData = await this.redis.get(key);

      if (!contextData) {
        // Initialize new context
        return this.initializeContext(sessionId);
      }

      const context: ConversationContext = JSON.parse(contextData);

      // Check if context has expired
      const ttl = await this.redis.ttl(key);
      if (ttl <= 0) {
        return this.initializeContext(sessionId);
      }

      return context;

    } catch (error) {
      logger.error('Failed to get context', { error, sessionId });
      return this.initializeContext(sessionId);
    }
  }

  /**
   * Update conversation context
   */
  async updateContext(
    sessionId: string,
    intent: IntentCategory,
    entities: ExtractedEntity[],
    patientVerified: boolean = false,
    patientId?: string
  ): Promise<void> {
    try {
      const context = await this.getContext(sessionId) || this.initializeContext(sessionId);

      // Create new conversation turn
      const turn: ConversationTurn = {
        timestamp: new Date().toISOString(),
        intent,
        entities
      };

      // Update context
      context.conversationHistory.push(turn);

      // Trim history if too long
      if (context.conversationHistory.length > this.MAX_HISTORY) {
        context.conversationHistory = context.conversationHistory.slice(-this.MAX_HISTORY);
      }

      // Update other fields
      context.lastIntent = intent;
      context.currentTopic = this.inferTopic(intent, context.conversationHistory);

      if (patientVerified && patientId) {
        context.patientVerified = true;
        context.patientId = patientId;
      }

      // Save to Redis
      const key = `${this.CONTEXT_PREFIX}${sessionId}`;
      await this.redis.setex(
        key,
        context.contextTimeout,
        JSON.stringify(context)
      );

      logger.debug('Context updated', {
        sessionId,
        intent,
        entitiesCount: entities.length,
        historyLength: context.conversationHistory.length
      });

    } catch (error) {
      logger.error('Failed to update context', { error, sessionId });
    }
  }

  /**
   * Initialize new context
   */
  private initializeContext(sessionId: string): ConversationContext {
    return {
      sessionId,
      patientVerified: false,
      conversationHistory: [],
      contextTimeout: this.DEFAULT_TIMEOUT
    };
  }

  /**
   * Infer current conversation topic
   */
  private inferTopic(
    currentIntent: IntentCategory,
    history: ConversationTurn[]
  ): string {
    // Count intent frequencies in recent history
    const recentIntents = history.slice(-5).map(turn => turn.intent);
    recentIntents.push(currentIntent);

    const intentCounts = new Map<IntentCategory, number>();
    for (const intent of recentIntents) {
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    }

    // Find most common intent
    let maxCount = 0;
    let dominantIntent = currentIntent;

    for (const [intent, count] of intentCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantIntent = intent;
      }
    }

    // Map to readable topic
    const topicMap: Record<IntentCategory, string> = {
      [IntentCategory.APPOINTMENT]: 'Appointment Scheduling',
      [IntentCategory.PRACTICE_INFO]: 'Practice Information',
      [IntentCategory.INSURANCE]: 'Insurance Coverage',
      [IntentCategory.PRESCRIPTION]: 'Prescription Management',
      [IntentCategory.EMERGENCY]: 'Medical Emergency',
      [IntentCategory.GENERAL]: 'General Inquiry',
      [IntentCategory.UNKNOWN]: 'Clarification Needed'
    };

    return topicMap[dominantIntent] || 'General Conversation';
  }

  /**
   * Clear context for session
   */
  async clearContext(sessionId: string): Promise<void> {
    try {
      const key = `${this.CONTEXT_PREFIX}${sessionId}`;
      await this.redis.del(key);

      logger.info('Context cleared', { sessionId });
    } catch (error) {
      logger.error('Failed to clear context', { error, sessionId });
    }
  }

  /**
   * Extend context timeout
   */
  async extendTimeout(sessionId: string, additionalSeconds: number = 300): Promise<void> {
    try {
      const key = `${this.CONTEXT_PREFIX}${sessionId}`;
      const ttl = await this.redis.ttl(key);

      if (ttl > 0) {
        await this.redis.expire(key, ttl + additionalSeconds);
        logger.debug('Context timeout extended', { sessionId, additionalSeconds });
      }
    } catch (error) {
      logger.error('Failed to extend timeout', { error, sessionId });
    }
  }

  /**
   * Get context summary for handoff
   */
  async getContextSummary(sessionId: string): Promise<string> {
    try {
      const context = await this.getContext(sessionId);

      if (!context || context.conversationHistory.length === 0) {
        return 'No conversation history available.';
      }

      const summary: string[] = [];

      // Patient verification status
      if (context.patientVerified) {
        summary.push(`Patient verified (ID: ${context.patientId})`);
      } else {
        summary.push('Patient not yet verified');
      }

      // Current topic
      if (context.currentTopic) {
        summary.push(`Current topic: ${context.currentTopic}`);
      }

      // Recent conversation turns
      summary.push('\nRecent conversation:');
      const recentTurns = context.conversationHistory.slice(-5);

      for (const turn of recentTurns) {
        const time = new Date(turn.timestamp).toLocaleTimeString();
        const entities = turn.entities.map(e => `${e.type}: ${e.value}`).join(', ');

        summary.push(`- ${time}: Intent: ${turn.intent}`);
        if (entities) {
          summary.push(`  Entities: ${entities}`);
        }
      }

      return summary.join('\n');

    } catch (error) {
      logger.error('Failed to get context summary', { error, sessionId });
      return 'Unable to retrieve conversation history.';
    }
  }

  /**
   * Bulk clear expired contexts (maintenance)
   */
  async clearExpiredContexts(): Promise<number> {
    try {
      const pattern = `${this.CONTEXT_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      let cleared = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl <= 0) {
          await this.redis.del(key);
          cleared++;
        }
      }

      if (cleared > 0) {
        logger.info('Expired contexts cleared', { count: cleared });
      }

      return cleared;

    } catch (error) {
      logger.error('Failed to clear expired contexts', { error });
      return 0;
    }
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(): Promise<{
    activeContexts: number;
    averageHistoryLength: number;
    verifiedPatients: number;
  }> {
    try {
      const pattern = `${this.CONTEXT_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      let totalHistory = 0;
      let verifiedCount = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const context: ConversationContext = JSON.parse(data);
          totalHistory += context.conversationHistory.length;
          if (context.patientVerified) {
            verifiedCount++;
          }
        }
      }

      const averageHistoryLength = keys.length > 0
        ? totalHistory / keys.length
        : 0;

      return {
        activeContexts: keys.length,
        averageHistoryLength,
        verifiedPatients: verifiedCount
      };

    } catch (error) {
      logger.error('Failed to get stats', { error });
      return {
        activeContexts: 0,
        averageHistoryLength: 0,
        verifiedPatients: 0
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}