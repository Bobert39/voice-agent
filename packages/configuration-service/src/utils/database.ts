import { Pool, PoolClient } from 'pg';
import Redis from 'redis';
import winston from 'winston';

// Database configuration
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// Redis configuration
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  ttl?: number;
}

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

class DatabaseManager {
  private static instance: DatabaseManager;
  private pgPool: Pool | null = null;
  private redisClient: any = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  public async initializePostgreSQL(config: DatabaseConfig): Promise<void> {
    try {
      this.pgPool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
        max: config.maxConnections || 20,
        idleTimeoutMillis: config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
      });

      // Test connection
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('PostgreSQL connection pool initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL connection pool:', error);
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  public async initializeRedis(config: RedisConfig): Promise<void> {
    try {
      this.redisClient = Redis.createClient({
        url: `redis://${config.password ? `:${config.password}@` : ''}${config.host}:${config.port}/${config.db || 0}`,
      });

      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis client error:', err);
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis client connected successfully');
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis connection:', error);
      throw error;
    }
  }

  /**
   * Get PostgreSQL client from pool
   */
  public async getPostgreSQLClient(): Promise<PoolClient> {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized');
    }
    return await this.pgPool.connect();
  }

  /**
   * Execute PostgreSQL query
   */
  public async executeQuery(text: string, params?: any[]): Promise<any> {
    const client = await this.getPostgreSQLClient();
    try {
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      logger.error('Database query error:', { text, params, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute PostgreSQL transaction
   */
  public async executeTransaction(queries: Array<{ text: string; params?: any[] }>): Promise<any[]> {
    const client = await this.getPostgreSQLClient();
    try {
      await client.query('BEGIN');
      const results: any[] = [];

      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction error:', { queries, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get Redis client
   */
  public getRedisClient(): any {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }
    return this.redisClient;
  }

  /**
   * Cache configuration data
   */
  public async cacheConfiguration(key: string, data: any, ttl: number = 3600): Promise<void> {
    try {
      const redis = this.getRedisClient();
      await redis.setEx(key, ttl, JSON.stringify(data));
      logger.debug('Configuration cached successfully:', { key, ttl });
    } catch (error) {
      logger.error('Cache set error:', { key, error });
      // Don't throw - caching is not critical
    }
  }

  /**
   * Get cached configuration data
   */
  public async getCachedConfiguration(key: string): Promise<any | null> {
    try {
      const redis = this.getRedisClient();
      const cached = await redis.get(key);
      if (cached) {
        logger.debug('Configuration retrieved from cache:', { key });
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error('Cache get error:', { key, error });
      return null; // Fallback to database
    }
  }

  /**
   * Invalidate cached configuration
   */
  public async invalidateCache(pattern: string): Promise<void> {
    try {
      const redis = this.getRedisClient();
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        logger.debug('Cache invalidated:', { pattern, keysCount: keys.length });
      }
    } catch (error) {
      logger.error('Cache invalidation error:', { pattern, error });
    }
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      logger.info('PostgreSQL pool closed');
    }
    if (this.redisClient) {
      await this.redisClient.quit();
      logger.info('Redis client closed');
    }
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ postgresql: boolean; redis: boolean }> {
    const health = { postgresql: false, redis: false };

    try {
      if (this.pgPool) {
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        health.postgresql = true;
      }
    } catch (error) {
      logger.error('PostgreSQL health check failed:', error);
    }

    try {
      if (this.redisClient) {
        await this.redisClient.ping();
        health.redis = true;
      }
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }

    return health;
  }
}

export default DatabaseManager;

// Environment-based configuration factory
export function createDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'voice_agent_config',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
  };
}

export function createRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    ttl: parseInt(process.env.REDIS_TTL || '3600'),
  };
}