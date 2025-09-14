import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@ai-voice-agent/shared-utils';
import { CacheKeys } from '../types';

const logger = createLogger('practice-info-cache');

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({
      url: redisUrl,
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB || '0'),
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        connectTimeout: 5000,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
      }
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
      }
    } catch (error) {
      logger.error('Failed to disconnect from Redis', { error });
      throw error;
    }
  }

  /**
   * Cache practice hours with date-specific key
   */
  async cachePracticeHours(date: string, hours: any, ttlHours: number = 24): Promise<void> {
    const key = `${CacheKeys.PRACTICE_HOURS}:${date}`;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(hours));
      logger.debug('Cached practice hours', { key, ttlHours });
    } catch (error) {
      logger.error('Failed to cache practice hours', { key, error });
    }
  }

  /**
   * Get cached practice hours for specific date
   */
  async getPracticeHours(date: string): Promise<any | null> {
    const key = `${CacheKeys.PRACTICE_HOURS}:${date}`;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for practice hours', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for practice hours', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached practice hours', { key, error });
      return null;
    }
  }

  /**
   * Cache location information
   */
  async cacheLocationInfo(locationInfo: any, ttlHours: number = 168): Promise<void> { // 7 days
    const key = CacheKeys.PRACTICE_LOCATION;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(locationInfo));
      logger.debug('Cached location info', { key, ttlHours });
    } catch (error) {
      logger.error('Failed to cache location info', { key, error });
    }
  }

  /**
   * Get cached location information
   */
  async getLocationInfo(): Promise<any | null> {
    const key = CacheKeys.PRACTICE_LOCATION;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for location info', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for location info', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached location info', { key, error });
      return null;
    }
  }

  /**
   * Cache accepted insurance plans
   */
  async cacheInsurancePlans(insurancePlans: any, ttlHours: number = 24): Promise<void> {
    const key = CacheKeys.INSURANCE_ACCEPTED;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(insurancePlans));
      logger.debug('Cached insurance plans', { key, ttlHours });
    } catch (error) {
      logger.error('Failed to cache insurance plans', { key, error });
    }
  }

  /**
   * Get cached insurance plans
   */
  async getInsurancePlans(): Promise<any | null> {
    const key = CacheKeys.INSURANCE_ACCEPTED;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for insurance plans', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for insurance plans', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached insurance plans', { key, error });
      return null;
    }
  }

  /**
   * Cache practice policies
   */
  async cachePracticePolicies(policies: any, ttlHours: number = 168): Promise<void> { // 7 days
    const key = CacheKeys.PRACTICE_POLICIES;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(policies));
      logger.debug('Cached practice policies', { key, ttlHours });
    } catch (error) {
      logger.error('Failed to cache practice policies', { key, error });
    }
  }

  /**
   * Get cached practice policies
   */
  async getPracticePolicies(): Promise<any | null> {
    const key = CacheKeys.PRACTICE_POLICIES;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for practice policies', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for practice policies', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached practice policies', { key, error });
      return null;
    }
  }

  /**
   * Cache preparation instructions by appointment type
   */
  async cachePreparationInstructions(appointmentType: string, instructions: any, ttlHours: number = 24): Promise<void> {
    const key = `${CacheKeys.PREPARATION_INSTRUCTIONS}:${appointmentType}`;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(instructions));
      logger.debug('Cached preparation instructions', { key, appointmentType, ttlHours });
    } catch (error) {
      logger.error('Failed to cache preparation instructions', { key, error });
    }
  }

  /**
   * Get cached preparation instructions
   */
  async getPreparationInstructions(appointmentType: string): Promise<any | null> {
    const key = `${CacheKeys.PREPARATION_INSTRUCTIONS}:${appointmentType}`;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for preparation instructions', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for preparation instructions', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached preparation instructions', { key, error });
      return null;
    }
  }

  /**
   * Cache current practice status (open/closed)
   */
  async cacheCurrentStatus(status: any, ttlMinutes: number = 15): Promise<void> {
    const key = CacheKeys.CURRENT_STATUS;
    const ttlSeconds = ttlMinutes * 60;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(status));
      logger.debug('Cached current status', { key, ttlMinutes });
    } catch (error) {
      logger.error('Failed to cache current status', { key, error });
    }
  }

  /**
   * Get cached current status
   */
  async getCurrentStatus(): Promise<any | null> {
    const key = CacheKeys.CURRENT_STATUS;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for current status', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for current status', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached current status', { key, error });
      return null;
    }
  }

  /**
   * Cache FAQ responses by category
   */
  async cacheFAQs(category: string, faqs: any, ttlHours: number = 24): Promise<void> {
    const key = `${CacheKeys.FAQ_RESPONSES}:${category}`;
    const ttlSeconds = ttlHours * 3600;
    
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(faqs));
      logger.debug('Cached FAQs', { key, category, ttlHours });
    } catch (error) {
      logger.error('Failed to cache FAQs', { key, error });
    }
  }

  /**
   * Get cached FAQ responses
   */
  async getFAQs(category: string): Promise<any | null> {
    const key = `${CacheKeys.FAQ_RESPONSES}:${category}`;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug('Cache hit for FAQs', { key });
        return JSON.parse(cached);
      }
      logger.debug('Cache miss for FAQs', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cached FAQs', { key, error });
      return null;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info('Invalidated cache keys', { pattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to invalidate cache by pattern', { pattern, error });
    }
  }

  /**
   * Invalidate specific cache key
   */
  async invalidateKey(key: string): Promise<void> {
    try {
      await this.client.del(key);
      logger.debug('Invalidated cache key', { key });
    } catch (error) {
      logger.error('Failed to invalidate cache key', { key, error });
    }
  }

  /**
   * Clear all practice information caches
   */
  async clearAllCaches(): Promise<void> {
    try {
      const patterns = [
        `${CacheKeys.PRACTICE_HOURS}:*`,
        CacheKeys.PRACTICE_LOCATION,
        CacheKeys.INSURANCE_ACCEPTED,
        CacheKeys.PRACTICE_POLICIES,
        `${CacheKeys.PREPARATION_INSTRUCTIONS}:*`,
        CacheKeys.CURRENT_STATUS,
        `${CacheKeys.FAQ_RESPONSES}:*`,
      ];

      for (const pattern of patterns) {
        await this.invalidateByPattern(pattern);
      }

      logger.info('Cleared all practice information caches');
    } catch (error) {
      logger.error('Failed to clear all caches', { error });
    }
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<{ connected: boolean; latency?: number }> {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      
      return {
        connected: this.isConnected,
        latency,
      };
    } catch (error) {
      logger.error('Cache health check failed', { error });
      return {
        connected: false,
      };
    }
  }

  /**
   * Background refresh mechanism - refresh cache before expiration
   */
  async refreshCacheInBackground(key: string, refreshFunction: () => Promise<any>, ttlHours: number): Promise<void> {
    try {
      // Check TTL remaining
      const ttl = await this.client.ttl(key);
      const refreshThresholdSeconds = 30 * 60; // 30 minutes before expiration

      if (ttl > 0 && ttl < refreshThresholdSeconds) {
        logger.info('Refreshing cache in background', { key, ttlRemaining: ttl });
        
        // Refresh in background without blocking
        refreshFunction()
          .then(async (data) => {
            const ttlSeconds = ttlHours * 3600;
            await this.client.setEx(key, ttlSeconds, JSON.stringify(data));
            logger.debug('Background cache refresh completed', { key });
          })
          .catch((error) => {
            logger.error('Background cache refresh failed', { key, error });
          });
      }
    } catch (error) {
      logger.error('Background cache refresh check failed', { key, error });
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();